-- ประชุมเตรียมงาน (ไฟล์ "ทำแผน.xlsx" แท็บ DATA, ผู้ใช้สั่ง 19 พ.ย. 2569)
-- นำเข้า 1 ครั้ง = 1 ชุด (prep_reports) หน้าเว็บแสดงชุดล่าสุด · ย้อนกลับ = ลบชุดนั้น
-- ไม่มีมูลค่าเงิน → ทุกบทบาทเห็น · นำเข้าได้เฉพาะ can_edit()
create table public.prep_reports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  date_from date,
  date_to date,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index prep_reports_batch_idx on public.prep_reports (import_batch_id);

create table public.prep_items (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.prep_reports (id) on delete cascade,
  sort integer not null,
  status text not null default '',               -- กำลังทำงาน / รอเข้าทำงาน / Potential
  project_code text not null,
  machine text not null default '',              -- ปั้นจั่น / รถกด / Tower Sliding (แถวแรกของโครงการ)
  machine_count numeric(8,2),
  bc numeric(8,2),
  customer text not null default '',
  project text not null default '',
  location text not null default '',
  product text not null default '',
  section numeric(10,2),                         -- หน้าตัด ตร.ซม.
  length_m numeric(8,2),
  joint text not null default '',
  rebar text not null default '',
  standard text not null default '',
  total_qty numeric(12,2) not null default 0,
  driven_qty numeric(12,2) not null default 0,
  remaining_qty numeric(12,2) not null default 0,
  plan jsonb not null default '{}'               -- yyyy-mm-dd → ต้น
);
create index prep_items_report_idx on public.prep_items (report_id, sort);

alter table public.prep_reports enable row level security;
alter table public.prep_items enable row level security;
create policy prep_reports_select on public.prep_reports for select to authenticated using (true);
create policy prep_reports_write on public.prep_reports for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy prep_items_select on public.prep_items for select to authenticated using (true);
create policy prep_items_write on public.prep_items for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));

create or replace function public.import_prep(p_file_name text, p_from date, p_to date, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_id uuid;
  v_rows integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์นำเข้าข้อมูล' using errcode = '42501';
  end if;

  insert into public.import_batches (kind, file_name, uploaded_by)
  values ('prep', p_file_name, (select auth.uid()))
  returning id into v_batch;

  insert into public.prep_reports (file_name, date_from, date_to, import_batch_id)
  values (p_file_name, p_from, p_to, v_batch)
  returning id into v_id;

  insert into public.prep_items (report_id, sort, status, project_code, machine, machine_count, bc, customer, project, location,
                                 product, section, length_m, joint, rebar, standard, total_qty, driven_qty, remaining_qty, plan)
  select v_id, x.sort, coalesce(x.status, ''), x.project_code, coalesce(x.machine, ''), x.machine_count, x.bc,
         coalesce(x.customer, ''), coalesce(x.project, ''), coalesce(x.location, ''), coalesce(x.product, ''), x.section, x.length_m,
         coalesce(x.joint, ''), coalesce(x.rebar, ''), coalesce(x.standard, ''), coalesce(x.total_qty, 0), coalesce(x.driven_qty, 0),
         coalesce(x.remaining_qty, 0), coalesce(x.plan, '{}')
  from jsonb_to_recordset(p_items) as x(sort integer, status text, project_code text, machine text, machine_count numeric, bc numeric,
    customer text, project text, location text, product text, section numeric, length_m numeric, joint text, rebar text, standard text,
    total_qty numeric, driven_qty numeric, remaining_qty numeric, plan jsonb);
  get diagnostics v_rows = row_count;

  update public.import_batches set rows_added = v_rows where id = v_batch;
  return jsonb_build_object('batch_id', v_batch, 'report_id', v_id, 'items', v_rows);
end;
$$;
revoke execute on function public.import_prep(text, date, date, jsonb) from public, anon;
grant execute on function public.import_prep(text, date, date, jsonb) to authenticated;

-- ย้อนกลับ: เพิ่ม prep (ลบชุดข้อมูลของการนำเข้านั้น) — นอกนั้นเหมือน 20261112000004
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
  elsif v_kind = 'prep' then
    select count(*) into v_deleted from public.prep_items i join public.prep_reports r on r.id = i.report_id where r.import_batch_id = p_batch;
    delete from public.prep_reports where import_batch_id = p_batch;
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
    raise exception 'ย้อนกลับได้เฉพาะการนำเข้าไฟล์คิว-วัน ไฟล์ประชุมแผนกขาย Profit and Loss ไฟล์แผนงาน และไฟล์ทำแผน (ประชุมเตรียมงาน)';
  end if;

  update public.import_batches set undone_at = now(), undone_by = (select auth.uid()) where id = p_batch;
  return v_deleted;
end;
$$;
