-- ยอดสั่งซื้อ/มูลค่าโครงการยึดใบ P−R−C ในระบบขาย (ผู้ใช้สั่ง 12 พ.ย. 2569) สำหรับทุกโครงการที่มีใบ P
-- * ยอดสั่งซื้อ (ต้น) = Σ qty ของ Group product BC / HX / IP / SC (Service ไม่นับต้น)
-- * มูลค่าโครงการ (รวม VAT) = Σ amount ทุกกลุ่ม (รวม Service) × 1.07  — amount ในไฟล์ SO เป็นก่อน VAT
-- * มูลค่าเฉลี่ย/ต้น = มูลค่าโครงการ ÷ ยอดสั่งซื้อ
-- โครงการที่ไม่มีใบ P ใช้ Master Planning / คิว-วัน เหมือนเดิม · เรียกหลังนำเข้า SO และ Master Planning ทุกครั้ง

create or replace function public.refresh_sales_order()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;

  with so as (
    select project_code,
           coalesce(sum(qty) filter (where group_product in ('BC', 'HX', 'IP', 'SC')), 0) as qty,
           round(coalesce(sum(amount), 0) * 1.07, 2) as value
    from public.sales_docs
    where project_code is not null
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
