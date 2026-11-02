-- โครงการที่ไม่มีใน Master Planning (order_source = 'queue'): ใช้ยอดสั่งซื้อจากไฟล์คิว-วัน
-- ยอดสั่งซื้อในคิว-วันเป็นยอดต่อ ขนาด × ความยาว → ยอดโครงการ = Σ ต่อ (ขนาด, ความยาว) ของค่าสูงสุด
create or replace function public.refresh_queue_order_qty()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.projects p
     set order_qty = q.qty
    from (
      select project_code, sum(o) as qty
      from (select project_code, size_code, length_m, max(order_qty) as o
              from public.drive_logs group by 1, 2, 3) s
      group by 1
    ) q
   where q.project_code = p.code and p.order_source = 'queue' and p.order_qty is distinct from q.qty;
$$;

revoke execute on function public.refresh_queue_order_qty() from public, anon;
grant execute on function public.refresh_queue_order_qty() to authenticated;

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

  perform public.refresh_queue_order_qty();

  update public.import_batches
     set rows_added = v_added, rows_duplicate = v_total - v_added, rows_error = coalesce(p_error_rows, 0)
   where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'added', v_added, 'duplicate', v_total - v_added);
end;
$$;

select public.refresh_queue_order_qty();
