-- นำเข้าไฟล์แผนงานของโครงการเดียว: แทนที่แผนตั้งแต่วันแรกในไฟล์เป็นต้นไป (แผนก่อนหน้านั้นคงไว้)
-- เก็บแผนเดิมที่ถูกแทนไว้ใน plan_import_old เพื่อย้อนกลับได้

create table public.plan_imports (
  batch_id uuid primary key references public.import_batches(id) on delete cascade,
  project_code text not null references public.projects(code) on delete cascade,
  from_date date not null
);
create index plan_imports_project_idx on public.plan_imports(project_code);

create table public.plan_import_old (
  batch_id uuid not null references public.plan_imports(batch_id) on delete cascade,
  plan_date date not null,
  planned_qty numeric not null,
  primary key (batch_id, plan_date)
);

alter table public.plan_imports enable row level security;
alter table public.plan_import_old enable row level security;
create policy plan_imports_rw on public.plan_imports for all to authenticated using (public.can_edit()) with check (public.can_edit());
create policy plan_import_old_rw on public.plan_import_old for all to authenticated using (public.can_edit()) with check (public.can_edit());

create or replace function public.import_project_plan(p_code text, p_file_name text, p_days jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_from date;
  v_old integer;
  v_new integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where code = p_code) then
    raise exception 'ไม่พบโครงการ %', p_code;
  end if;
  select min((d->>'date')::date) into v_from from jsonb_array_elements(p_days) d;
  if v_from is null then
    raise exception 'ไฟล์ไม่มีแผนรายวัน';
  end if;

  insert into public.import_batches (kind, file_name, uploaded_by)
  values ('plan', p_file_name, (select auth.uid()))
  returning id into v_batch;
  insert into public.plan_imports (batch_id, project_code, from_date) values (v_batch, p_code, v_from);

  insert into public.plan_import_old (batch_id, plan_date, planned_qty)
  select v_batch, plan_date, planned_qty from public.project_plan_days
  where project_code = p_code and plan_date >= v_from;
  get diagnostics v_old = row_count;

  delete from public.project_plan_days where project_code = p_code and plan_date >= v_from;

  insert into public.project_plan_days (project_code, plan_date, planned_qty, updated_by)
  select p_code, (d->>'date')::date, sum((d->>'qty')::numeric), (select auth.uid())
  from jsonb_array_elements(p_days) d
  where (d->>'qty')::numeric > 0
  group by (d->>'date')::date;
  get diagnostics v_new = row_count;

  update public.import_batches set rows_added = v_new, rows_removed = v_old where id = v_batch;
  return jsonb_build_object('batch_id', v_batch, 'from', v_from, 'added', v_new, 'replaced', v_old);
end;
$$;

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
