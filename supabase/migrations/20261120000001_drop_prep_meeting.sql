-- ยกเลิกเมนูประชุมงานเตรียมงาน (ผู้ใช้สั่ง 20 พ.ย. 2569 "ไม่ต้องให้อยู่ใน app") — ลบตาราง/ฟังก์ชันจาก 20261119000002
-- ค่า enum import_kind 'prep' คงไว้ (Postgres ลบค่า enum ไม่ได้ ไม่มีผลกับระบบ)
drop function if exists public.import_prep(text, date, date, jsonb);
drop table if exists public.prep_items;
drop table if exists public.prep_reports;
delete from public.import_batches where kind = 'prep';

-- undo_import กลับเป็นแบบ 20261112000004 (ไม่มี prep)
create or replace function public.undo_import(p_batch uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.import_kind;
  v_deleted integer;
  v_code text;
  v_from date;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  select kind into v_kind from public.import_batches where id = p_batch and undone_at is null;
  if v_kind is null then
    raise exception 'ไม่พบรายการนำเข้า หรือย้อนกลับไปแล้ว';
  end if;

  if v_kind = 'sales_meeting' then
    delete from public.sales_meetings where import_batch_id = p_batch;
    get diagnostics v_deleted = row_count;
  elsif v_kind = 'pnl' then
    select count(*) into v_deleted from public.pnl_projects p join public.pnl_reports r on r.id = p.report_id where r.import_batch_id = p_batch;
    delete from public.pnl_reports where import_batch_id = p_batch;
  elsif v_kind = 'plan' then
    select project_code, from_date into v_code, v_from from public.plan_imports where batch_id = p_batch;
    delete from public.project_plan_days where project_code = v_code and plan_date >= v_from;
    get diagnostics v_deleted = row_count;
    insert into public.project_plan_days (project_code, plan_date, planned_qty, updated_by)
    select v_code, plan_date, planned_qty, (select auth.uid()) from public.plan_import_old where batch_id = p_batch;
  elsif v_kind = 'queue' then
    delete from public.drive_logs where import_batch_id = p_batch;
    get diagnostics v_deleted = row_count;

    insert into public.drive_logs (
      work_date, project_code, owner_name, agency, province, project_type, job_status, leader,
      company_raw, company_id, rig_name, rig_type, order_qty, standard, size_code, section, length_m,
      shift, qty, cubic_m, meters, source, import_batch_id, created_by, created_at, dedupe_key)
    select work_date, project_code, owner_name, agency, province, project_type, job_status, leader,
           company_raw, company_id, rig_name, rig_type, order_qty, standard, size_code, section, length_m,
           shift, qty, cubic_m, meters, source, import_batch_id, created_by, created_at, dedupe_key
    from public.drive_logs_removed where removed_by_batch = p_batch
    on conflict (dedupe_key) do nothing;
    delete from public.drive_logs_removed where removed_by_batch = p_batch;

    perform public.refresh_queue_order_qty();
  else
    raise exception 'ย้อนกลับได้เฉพาะการนำเข้าไฟล์คิว-วัน ไฟล์ประชุมแผนกขาย Profit and Loss และไฟล์แผนงาน';
  end if;

  update public.import_batches set undone_at = now(), undone_by = (select auth.uid()) where id = p_batch;
  return v_deleted;
end;
$$;
