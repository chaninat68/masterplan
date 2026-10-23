-- ฟังก์ชันนำเข้าไฟล์ (เรียกจาก Server Action) — security invoker: RLS ของผู้เรียกมีผล + เช็ก can_edit ซ้ำ
-- แต่ละฟังก์ชันทำงานใน transaction เดียว: สำเร็จทั้งหมดหรือไม่เข้าเลย

create or replace function public.company_category_of(raw text)
returns public.company_category
language sql
immutable
set search_path = ''
as $$
  select case
    when raw = 'ASIA' then 'asia'::public.company_category
    when raw = 'ASIA-ร่วม' then 'asia_joint'::public.company_category
    else 'subcontractor'::public.company_category
  end
$$;

-- ไฟล์คิว-วัน: เพิ่มเฉพาะแถวใหม่ (dedupe_key), สร้างบริษัท/ปั้นจั่น/โครงการที่ยังไม่มีให้อัตโนมัติ
create or replace function public.import_drive_logs(p_file_name text, p_rows jsonb, p_error_rows integer default 0)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_added integer;
  v_total integer := jsonb_array_length(p_rows);
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

  update public.import_batches
     set rows_added = v_added, rows_duplicate = v_total - v_added, rows_error = coalesce(p_error_rows, 0)
   where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'added', v_added, 'duplicate', v_total - v_added);
end;
$$;

-- ไฟล์ Master Planning: อัพเดทโครงการ + แทนที่แผนรายวันและ Actual ก่อนปี 69 ของโครงการในไฟล์
-- หมายเหตุรายวันจากไฟล์ไม่ทับหมายเหตุที่พิมพ์ในเว็บ
create or replace function public.import_master_planning(
  p_file_name text, p_projects jsonb, p_plans jsonb, p_legacy jsonb, p_notes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_projects integer;
  v_plans integer;
  v_legacy integer;
  v_notes integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์นำเข้าข้อมูล' using errcode = '42501';
  end if;

  insert into public.import_batches (kind, file_name, uploaded_by)
  values ('master_planning', p_file_name, (select auth.uid()))
  returning id into v_batch;

  insert into public.projects (code, pm, sales, status, customer_name, project_name, order_qty, contract_value,
                               value_per_pile, start_date, end_date, billing_cycle, end_note, order_source, updated_by)
  select x.code, coalesce(x.pm, ''), coalesce(x.sales, ''), x.status::public.project_status, coalesce(x.customer_name, ''),
         coalesce(x.project_name, ''), coalesce(x.order_qty, 0), coalesce(x.contract_value, 0), coalesce(x.value_per_pile, 0),
         x.start_date, x.end_date, coalesce(x.billing_cycle, ''), coalesce(x.end_note, ''), 'master_planning', (select auth.uid())
  from jsonb_to_recordset(p_projects) as x(
    code text, pm text, sales text, status text, customer_name text, project_name text, order_qty numeric,
    contract_value numeric, value_per_pile numeric, start_date date, end_date date, billing_cycle text, end_note text)
  on conflict (code) do update set
    pm = excluded.pm, sales = excluded.sales, status = excluded.status,
    customer_name = excluded.customer_name, project_name = excluded.project_name,
    order_qty = excluded.order_qty, contract_value = excluded.contract_value, value_per_pile = excluded.value_per_pile,
    start_date = excluded.start_date, end_date = excluded.end_date, billing_cycle = excluded.billing_cycle,
    end_note = excluded.end_note, order_source = 'master_planning', updated_by = excluded.updated_by;
  get diagnostics v_projects = row_count;

  delete from public.project_plan_days
   where project_code in (select x.code from jsonb_to_recordset(p_projects) as x(code text));
  insert into public.project_plan_days (project_code, plan_date, planned_qty, updated_by)
  select x.c, x.d, x.q, (select auth.uid())
  from jsonb_to_recordset(p_plans) as x(c text, d date, q numeric)
  where x.q > 0;
  get diagnostics v_plans = row_count;

  delete from public.project_actual_legacy
   where project_code in (select x.code from jsonb_to_recordset(p_projects) as x(code text));
  insert into public.project_actual_legacy (project_code, work_date, qty)
  select x.c, x.d, x.q
  from jsonb_to_recordset(p_legacy) as x(c text, d date, q numeric)
  where x.q > 0;
  get diagnostics v_legacy = row_count;

  insert into public.daily_notes (project_code, note_date, body, source, created_by)
  select x.c, x.d, x.b, 'import', (select auth.uid())
  from jsonb_to_recordset(p_notes) as x(c text, d date, b text)
  where length(trim(x.b)) > 0
  on conflict on constraint daily_notes_one_per_day do nothing;
  get diagnostics v_notes = row_count;

  update public.import_batches set rows_added = v_projects where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'projects', v_projects, 'plans', v_plans,
                            'legacy', v_legacy, 'notes', v_notes);
end;
$$;

-- ไฟล์ SO: แทนที่เอกสารขายในช่วงวันที่ของไฟล์ + อัพเดทลูกค้า
create or replace function public.import_sales(
  p_file_name text, p_customers jsonb, p_docs jsonb, p_from date, p_to date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_deleted integer;
  v_added integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์นำเข้าข้อมูล' using errcode = '42501';
  end if;

  insert into public.import_batches (kind, file_name, uploaded_by)
  values ('sales', p_file_name, (select auth.uid()))
  returning id into v_batch;

  insert into public.customers (code, name, customer_group, registered_at)
  select x.code, x.name, coalesce(x.customer_group, 'ไม่ระบุ'), x.registered_at
  from jsonb_to_recordset(p_customers) as x(code text, name text, customer_group text, registered_at date)
  on conflict (code) do update set name = excluded.name, customer_group = excluded.customer_group,
                                   registered_at = coalesce(excluded.registered_at, public.customers.registered_at);

  delete from public.sales_docs where doc_date between p_from and p_to;
  get diagnostics v_deleted = row_count;

  insert into public.sales_docs (
    doc_type, doc_date, so_code, project_code, project_name, customer_code, customer_name, customer_group,
    item_code, item_name, item_kind, product, group_product, section, standard, pile_form, length_m, qty,
    unit_price, install_fee, amount, m3, approval_status, work_status, salesperson, service_type,
    construction_type, province, is_new_customer, import_batch_id)
  select x.doc_type::public.sales_doc_type, x.doc_date, coalesce(x.so_code, ''), coalesce(x.project_code, ''),
         coalesce(x.project_name, ''), nullif(x.customer_code, ''), coalesce(x.customer_name, ''),
         coalesce(x.customer_group, 'ไม่ระบุ'), coalesce(x.item_code, ''), coalesce(x.item_name, ''),
         coalesce(x.item_kind, ''), coalesce(x.product, ''), coalesce(x.group_product, ''), x.section,
         coalesce(x.standard, ''), coalesce(x.pile_form, ''), x.length_m, coalesce(x.qty, 0),
         coalesce(x.unit_price, 0), coalesce(x.install_fee, 0), coalesce(x.amount, 0), coalesce(x.m3, 0),
         coalesce(x.approval_status, ''), coalesce(x.work_status, ''), coalesce(nullif(x.salesperson, ''), 'ไม่ระบุ'),
         coalesce(x.service_type, ''), coalesce(x.construction_type, ''), coalesce(x.province, ''),
         coalesce(x.is_new_customer, false), v_batch
  from jsonb_to_recordset(p_docs) as x(
    doc_type text, doc_date date, so_code text, project_code text, project_name text, customer_code text,
    customer_name text, customer_group text, item_code text, item_name text, item_kind text, product text,
    group_product text, section numeric, standard text, pile_form text, length_m numeric, qty numeric,
    unit_price numeric, install_fee numeric, amount numeric, m3 numeric, approval_status text, work_status text,
    salesperson text, service_type text, construction_type text, province text, is_new_customer boolean);
  get diagnostics v_added = row_count;

  update public.import_batches set rows_added = v_added, rows_duplicate = v_deleted where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'added', v_added, 'replaced', v_deleted);
end;
$$;

-- ย้อนกลับการนำเข้าไฟล์คิว-วัน (ลบแถวของ batch นั้น)
create or replace function public.undo_import(p_batch uuid)
returns integer
language plpgsql
security invoker
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
  update public.import_batches set undone_at = now(), undone_by = (select auth.uid()) where id = p_batch;
  return v_deleted;
end;
$$;

revoke execute on function public.import_drive_logs(text, jsonb, integer) from public, anon;
revoke execute on function public.import_master_planning(text, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.import_sales(text, jsonb, jsonb, date, date) from public, anon;
revoke execute on function public.undo_import(uuid) from public, anon;
grant execute on function public.import_drive_logs(text, jsonb, integer) to authenticated;
grant execute on function public.import_master_planning(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.import_sales(text, jsonb, jsonb, date, date) to authenticated;
grant execute on function public.undo_import(uuid) to authenticated;
