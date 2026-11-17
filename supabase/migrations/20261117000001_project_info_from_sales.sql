-- ชื่อลูกค้า / ชื่อโครงการ / หน่วยงาน ของโครงการ อ้างอิงรหัสโครงการ ดึงจากไฟล์ข้อมูล SO (ผู้ใช้สั่ง 17 พ.ย. 2569)
-- * ลูกค้า = "ชื่อลูกค้า", ชื่อโครงการ = "โครงการ", หน่วยงาน = "ชื่อที่อยู่โครงการ" (คอลัมน์ใหม่ sales_docs.site_address)
-- * เลือกจากใบ P ล่าสุดก่อน (ไม่มีใบ P = เอกสารล่าสุด) เฉพาะค่าที่ไม่ว่าง · ทุกโครงการที่มีเอกสารในไฟล์ SO
-- * รันใน refresh_sales_order() (หลังนำเข้า SO / Master Planning ทุกครั้ง) → Master Planning ไม่ทับชื่อจาก SO

alter table public.sales_docs add column if not exists site_address text not null default '';

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
    doc_type, doc_date, so_code, project_code, project_name, site_address, customer_code, customer_name, customer_group,
    item_code, item_name, item_kind, product, group_product, section, standard, pile_form, length_m, qty,
    unit_price, install_fee, amount, m3, approval_status, work_status, salesperson, service_type,
    construction_type, province, is_new_customer, import_batch_id)
  select x.doc_type::public.sales_doc_type, x.doc_date, coalesce(x.so_code, ''), coalesce(x.project_code, ''),
         coalesce(x.project_name, ''), coalesce(x.site_address, ''), nullif(x.customer_code, ''), coalesce(x.customer_name, ''),
         coalesce(x.customer_group, 'ไม่ระบุ'), coalesce(x.item_code, ''), coalesce(x.item_name, ''),
         coalesce(x.item_kind, ''), coalesce(x.product, ''), coalesce(x.group_product, ''), x.section,
         coalesce(x.standard, ''), coalesce(x.pile_form, ''), x.length_m, coalesce(x.qty, 0),
         coalesce(x.unit_price, 0), coalesce(x.install_fee, 0), coalesce(x.amount, 0), coalesce(x.m3, 0),
         coalesce(x.approval_status, ''), coalesce(x.work_status, ''), coalesce(nullif(x.salesperson, ''), 'ไม่ระบุ'),
         coalesce(x.service_type, ''), coalesce(x.construction_type, ''), coalesce(x.province, ''),
         coalesce(x.is_new_customer, false), v_batch
  from jsonb_to_recordset(p_docs) as x(
    doc_type text, doc_date date, so_code text, project_code text, project_name text, site_address text, customer_code text,
    customer_name text, customer_group text, item_code text, item_name text, item_kind text, product text,
    group_product text, section numeric, standard text, pile_form text, length_m numeric, qty numeric,
    unit_price numeric, install_fee numeric, amount numeric, m3 numeric, approval_status text, work_status text,
    salesperson text, service_type text, construction_type text, province text, is_new_customer boolean);
  get diagnostics v_added = row_count;

  update public.import_batches set rows_added = v_added, rows_duplicate = v_deleted where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'added', v_added, 'replaced', v_deleted);
end;
$$;
revoke execute on function public.import_sales(text, jsonb, jsonb, date, date) from public, anon;
grant execute on function public.import_sales(text, jsonb, jsonb, date, date) to authenticated;

-- ชื่อ/ลูกค้า/หน่วยงาน จากไฟล์ SO (ภายใน — เรียกจาก refresh_sales_order เท่านั้น)
create or replace function public.sync_project_info_from_sales()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  with pick as (
    select c.code,
      (select regexp_replace(btrim(d.customer_name), '[[:space:]]+', ' ', 'g') from public.sales_docs d where d.project_code = c.code and btrim(d.customer_name) <> ''
        order by (d.doc_type = 'P') desc, d.doc_date desc, d.id desc limit 1) as cn,
      (select regexp_replace(btrim(d.project_name), '[[:space:]]+', ' ', 'g') from public.sales_docs d where d.project_code = c.code and btrim(d.project_name) <> ''
        order by (d.doc_type = 'P') desc, d.doc_date desc, d.id desc limit 1) as pn,
      (select regexp_replace(btrim(d.site_address), '[[:space:]]+', ' ', 'g') from public.sales_docs d where d.project_code = c.code and btrim(d.site_address) <> ''
        order by (d.doc_type = 'P') desc, d.doc_date desc, d.id desc limit 1) as addr
    from (select distinct project_code as code from public.sales_docs where project_code <> '') c
  )
  update public.projects p
     set customer_name = coalesce(pick.cn, p.customer_name),
         project_name = coalesce(pick.pn, p.project_name),
         agency = coalesce(pick.addr, p.agency),
         updated_at = now()
    from pick
   where pick.code = p.code
     and (p.customer_name is distinct from coalesce(pick.cn, p.customer_name)
          or p.project_name is distinct from coalesce(pick.pn, p.project_name)
          or p.agency is distinct from coalesce(pick.addr, p.agency));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.sync_project_info_from_sales() from public, anon, authenticated;

-- refresh_sales_order(): เหมือน 20261112000006 + ซิงก์ชื่อ/ลูกค้า/หน่วยงาน
create or replace function public.refresh_sales_order()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_yr integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;

  perform public.sync_project_info_from_sales();

  select (extract(year from min(doc_date))::int + 543) % 100 into v_yr from public.sales_docs;

  with so as (
    select project_code,
           coalesce(sum(qty) filter (where group_product in ('BC', 'HX', 'IP', 'SC')), 0) as qty,
           round(coalesce(sum(amount), 0) * 1.07, 2) as value
    from public.sales_docs
    where project_code ~ '^[A-Z][0-9]{2}-' and substr(project_code, 2, 2)::int >= v_yr
    group by project_code
    having bool_or(doc_type = 'P')
  )
  update public.projects p
     set order_qty = so.qty,
         contract_value = so.value,
         value_per_pile = case when so.qty > 0 then round(so.value / so.qty, 2) else 0 end,
         order_source = 'sales',
         updated_at = now()
    from so
   where so.project_code = p.code
     and (p.order_qty is distinct from so.qty or p.contract_value is distinct from so.value
          or p.order_source <> 'sales');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.refresh_sales_order() from public, anon;
grant execute on function public.refresh_sales_order() to authenticated;
