-- refresh_sales_order(): เฉพาะโครงการที่รหัสปี (A69-…) ไม่เก่ากว่าปีของเอกสารแรกในไฟล์ SO
-- ไฟล์ SO มีเฉพาะเอกสารปีนั้น โครงการปีก่อน (A67/A68) มีแค่ใบเพิ่ม/ลดบางส่วน — ใช้ Master Planning ต่อ

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
