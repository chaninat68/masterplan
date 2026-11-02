-- นำเข้าคิว-วันแบบ sync: ไฟล์คิว-วันคือตัวจริงของผลงาน — แถว (จากการนำเข้า) ในช่วงวันที่ของไฟล์
-- ที่ไม่มีในไฟล์แล้ว (ถูกแก้/ลบในไฟล์) ย้ายไปเก็บที่ drive_logs_removed แล้วลบออก → ย้อนกลับการนำเข้าได้ครบ
-- แถวที่กรอกในเว็บ (source = 'manual') ไม่ถูกแตะ

create table public.drive_logs_removed (
  like public.drive_logs including defaults,
  removed_by_batch uuid not null references public.import_batches (id) on delete cascade,
  removed_at timestamptz not null default now()
);
create index drive_logs_removed_batch_idx on public.drive_logs_removed (removed_by_batch);
alter table public.drive_logs_removed enable row level security;
create policy drive_logs_removed_select on public.drive_logs_removed for select to authenticated using ((select public.can_edit()));
create policy drive_logs_removed_insert on public.drive_logs_removed for insert to authenticated with check ((select public.can_edit()));
create policy drive_logs_removed_delete on public.drive_logs_removed for delete to authenticated using ((select public.can_edit()));

alter table public.import_batches add column rows_removed integer not null default 0;

create or replace function public.import_drive_logs(p_file_name text, p_rows jsonb, p_error_rows integer default 0)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_added integer;
  v_removed integer := 0;
  v_total integer := jsonb_array_length(p_rows);
  v_from date;
  v_to date;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์นำเข้าข้อมูล' using errcode = '42501';
  end if;

  insert into public.import_batches (kind, file_name, uploaded_by)
  values ('queue', p_file_name, (select auth.uid()))
  returning id into v_batch;

  insert into public.companies (name, category)
  select distinct x.company_raw, public.company_category_of(x.company_raw)
  from jsonb_to_recordset(p_rows) as x(company_raw text)
  where coalesce(x.company_raw, '') <> ''
    and not exists (select 1 from public.company_aliases a where a.raw_name = x.company_raw)
  on conflict (name) do nothing;

  insert into public.company_aliases (raw_name, company_id)
  select distinct x.company_raw, c.id
  from jsonb_to_recordset(p_rows) as x(company_raw text)
  join public.companies c on c.name = x.company_raw
  on conflict (raw_name) do nothing;

  insert into public.rigs (name, rig_type, company_id)
  select distinct on (x.rig_name) x.rig_name, coalesce(x.rig_type, ''), a.company_id
  from jsonb_to_recordset(p_rows) as x(rig_name text, rig_type text, company_raw text)
  left join public.company_aliases a on a.raw_name = x.company_raw
  where coalesce(x.rig_name, '') <> ''
  order by x.rig_name
  on conflict (name) do nothing;

  -- โครงการที่ไม่มีใน Master Planning (สร้างจากข้อมูลคิว-วัน)
  insert into public.projects (code, customer_name, project_name, agency, province, project_type, status, order_source)
  select distinct on (x.project_code)
         x.project_code, coalesce(x.owner_name, ''), coalesce(x.agency, ''), coalesce(x.agency, ''),
         coalesce(x.province, ''), coalesce(x.project_type, ''),
         (case x.job_status
            when 'จบงาน' then 'completed'
            when 'กำลังดำเนินการ' then 'ongoing'
            when 'มีปัญหา' then 'hold'
            else 'on_hand' end)::public.project_status,
         'queue'
  from jsonb_to_recordset(p_rows) as x(project_code text, owner_name text, agency text, province text, project_type text, job_status text)
  order by x.project_code
  on conflict (code) do nothing;

  -- แถวที่ไม่มีในไฟล์แล้ว (ช่วงวันที่ของไฟล์, เฉพาะที่มาจากการนำเข้า) → เก็บสำรองแล้วลบ
  select min(x.work_date), max(x.work_date) into v_from, v_to
  from jsonb_to_recordset(p_rows) as x(work_date date);
  if v_from is not null then
    with gone as (
      delete from public.drive_logs l
       where l.source = 'import' and l.work_date between v_from and v_to
         and not exists (select 1 from jsonb_to_recordset(p_rows) as x(dedupe_key text) where x.dedupe_key = l.dedupe_key)
      returning l.*
    )
    insert into public.drive_logs_removed
    select g.*, v_batch, now() from gone g;
    get diagnostics v_removed = row_count;
  end if;

  insert into public.drive_logs (
    work_date, project_code, owner_name, agency, province, project_type, job_status, leader,
    company_raw, company_id, rig_name, rig_type, order_qty, standard, size_code, section, length_m,
    shift, qty, cubic_m, meters, source, import_batch_id, created_by, dedupe_key)
  select x.work_date, x.project_code, coalesce(x.owner_name, ''), coalesce(x.agency, ''), coalesce(x.province, ''),
         coalesce(x.project_type, ''), coalesce(x.job_status, ''), coalesce(x.leader, ''),
         coalesce(x.company_raw, ''), a.company_id, x.rig_name, coalesce(x.rig_type, ''), coalesce(x.order_qty, 0),
         coalesce(x.standard, ''), coalesce(x.size_code, ''), x.section, x.length_m,
         coalesce(x.shift, ''), x.qty, coalesce(x.cubic_m, 0), coalesce(x.meters, 0),
         coalesce(x.source, 'import')::public.data_source, v_batch, (select auth.uid()), x.dedupe_key
  from jsonb_to_recordset(p_rows) as x(
    work_date date, project_code text, owner_name text, agency text, province text, project_type text,
    job_status text, leader text, company_raw text, rig_name text, rig_type text, order_qty numeric,
    standard text, size_code text, section numeric, length_m numeric, shift text, qty numeric,
    cubic_m numeric, meters numeric, source text, dedupe_key text)
  left join public.company_aliases a on a.raw_name = x.company_raw
  on conflict (dedupe_key) do nothing;
  get diagnostics v_added = row_count;

  perform public.refresh_queue_order_qty();

  update public.import_batches
     set rows_added = v_added, rows_duplicate = v_total - v_added, rows_error = coalesce(p_error_rows, 0), rows_removed = v_removed
   where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'added', v_added, 'duplicate', v_total - v_added, 'removed', v_removed);
end;
$$;

-- ย้อนกลับการนำเข้าคิว-วัน: ลบแถวที่เพิ่ม และคืนแถวที่การนำเข้านั้นเอาออก
create or replace function public.undo_import(p_batch uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.import_kind;
  v_deleted integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  select kind into v_kind from public.import_batches where id = p_batch and undone_at is null;
  if v_kind is null then
    raise exception 'ไม่พบรายการนำเข้า หรือย้อนกลับไปแล้ว';
  end if;
  if v_kind <> 'queue' then
    raise exception 'ย้อนกลับได้เฉพาะการนำเข้าไฟล์คิว-วัน';
  end if;
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
  update public.import_batches set undone_at = now(), undone_by = (select auth.uid()) where id = p_batch;
  return v_deleted;
end;
$$;
