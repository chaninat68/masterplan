-- นำเข้าไฟล์แผน (Plan.xlsx) ได้นอกจากไฟล์ Master Planning เดิม:
-- * แทนที่แผนรายวันเฉพาะช่วงวันที่ของไฟล์ (แผนนอกช่วงคงไว้)
-- * แทนที่ Actual ก่อนปี 69 เฉพาะเมื่อไฟล์มีแถว Actual
-- * เงื่อนไขส่งมอบงาน / หมายเหตุท้ายแผน ที่ว่างในไฟล์ = คงค่าเดิม
drop function if exists public.import_master_planning(text, jsonb, jsonb, jsonb, jsonb);

create function public.import_master_planning(
  p_file_name text, p_projects jsonb, p_plans jsonb, p_legacy jsonb, p_notes jsonb,
  -- ค่าเริ่มต้น = พฤติกรรมเดิม (แทนที่แผนทั้งหมด + Actual ก่อนปี 69) ให้โค้ดเวอร์ชันก่อนเรียกได้
  p_plan_from date default null, p_plan_to date default null, p_replace_legacy boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_projects integer;
  v_plans integer;
  v_legacy integer := 0;
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
    start_date = excluded.start_date, end_date = excluded.end_date,
    billing_cycle = coalesce(nullif(excluded.billing_cycle, ''), public.projects.billing_cycle),
    end_note = coalesce(nullif(excluded.end_note, ''), public.projects.end_note),
    order_source = 'master_planning', updated_by = excluded.updated_by;
  get diagnostics v_projects = row_count;

  delete from public.project_plan_days
   where project_code in (select x.code from jsonb_to_recordset(p_projects) as x(code text))
     and plan_date between coalesce(p_plan_from, '-infinity'::date) and coalesce(p_plan_to, 'infinity'::date);
  insert into public.project_plan_days (project_code, plan_date, planned_qty, updated_by)
  select x.c, x.d, x.q, (select auth.uid())
  from jsonb_to_recordset(p_plans) as x(c text, d date, q numeric)
  where x.q > 0;
  get diagnostics v_plans = row_count;

  if p_replace_legacy then
    delete from public.project_actual_legacy
     where project_code in (select x.code from jsonb_to_recordset(p_projects) as x(code text));
    insert into public.project_actual_legacy (project_code, work_date, qty)
    select x.c, x.d, x.q
    from jsonb_to_recordset(p_legacy) as x(c text, d date, q numeric)
    where x.q > 0;
    get diagnostics v_legacy = row_count;
  end if;

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

revoke execute on function public.import_master_planning(text, jsonb, jsonb, jsonb, jsonb, date, date, boolean) from public, anon;
grant execute on function public.import_master_planning(text, jsonb, jsonb, jsonb, jsonb, date, date, boolean) to authenticated;
