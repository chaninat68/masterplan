-- ผลงานรายวันแยกกลุ่มบริษัทปั้นจั่น (กราฟหน้าภาพรวม)
create view public.v_daily_company with (security_invoker = true) as
select l.work_date, coalesce(c.category, 'subcontractor') as company_category, sum(l.qty) as qty
from public.drive_logs l
left join public.companies c on c.id = l.company_id
group by l.work_date, coalesce(c.category, 'subcontractor');
