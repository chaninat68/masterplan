-- View สำหรับคำนวณตัวเลขฝั่งฐานข้อมูล — ทุก view ใช้ security_invoker ให้ RLS ของผู้เรียกมีผล

-- วันที่ข้อมูลล่าสุด = วันล่าสุดที่มีผลงานตอก > 0
create view public.v_data_asof with (security_invoker = true) as
select coalesce(max(work_date), current_date) as asof
from public.drive_logs
where qty > 0;

-- ผลงานรายวันต่อโครงการ: คิว-วัน (ตัวจริง) + Actual จาก Master Planning เฉพาะก่อนวันตัด
create view public.v_project_actual_days with (security_invoker = true) as
with cutoff as (
  select (value #>> '{}')::date as d from public.settings where key = 'legacy_actual_cutoff'
)
select project_code, work_date, sum(qty)::numeric(12, 3) as qty
from (
  select project_code, work_date, qty from public.drive_logs
  union all
  select l.project_code, l.work_date, l.qty
  from public.project_actual_legacy l
  cross join cutoff
  where l.work_date < cutoff.d
) x
group by project_code, work_date;

-- ความคืบหน้าโครงการ: ตอกแล้ว, แผนสะสม, เร็ว/ช้า, อัตรา 14 วัน, คาดเสร็จ, มูลค่า
create view public.v_project_progress with (security_invoker = true) as
with asof as (select asof as d from public.v_data_asof),
act as (
  select a.project_code,
         sum(a.qty) as done,
         sum(a.qty) filter (where a.work_date > asof.d - 14 and a.work_date <= asof.d) as last14
  from public.v_project_actual_days a cross join asof
  group by a.project_code
),
pl as (
  select p.project_code,
         sum(p.planned_qty) as plan_total,
         sum(p.planned_qty) filter (where p.plan_date <= asof.d) as plan_to_date
  from public.project_plan_days p cross join asof
  group by p.project_code
),
base as (
  select pr.code as project_code, pr.status, pr.order_qty, pr.value_per_pile, asof.d as asof,
         coalesce(act.done, 0) as done_qty,
         coalesce(act.last14, 0) as last14_qty,
         coalesce(pl.plan_to_date, 0) as plan_to_date,
         coalesce(pl.plan_total, 0) as plan_total,
         pl.plan_total is not null as has_plan
  from public.projects pr
  cross join asof
  left join act on act.project_code = pr.code
  left join pl on pl.project_code = pr.code
)
select project_code, status, asof, order_qty, value_per_pile,
       done_qty, plan_to_date, plan_total, has_plan,
       done_qty - plan_to_date as ahead_behind,
       greatest(order_qty - done_qty, 0) as remain_qty,
       round(last14_qty / 14.0, 3) as rate_per_day,
       case when greatest(order_qty - done_qty, 0) > 0 and last14_qty > 0
            then asof + ceil(greatest(order_qty - done_qty, 0) / (last14_qty / 14.0))::int
       end as eta,
       case when order_qty > 0 then least(1, done_qty / order_qty) else 0 end as pct_done,
       case when order_qty > 0 then least(1, plan_to_date / order_qty) else 0 end as pct_plan,
       round(done_qty * value_per_pile, 2) as value_done,
       round(greatest(order_qty - done_qty, 0) * value_per_pile, 2) as value_remain
from base;

-- ใบ P − R − C สุทธิต่อโครงการ (ใช้ตรวจเทียบกับ Master Planning) — นับจำนวนเฉพาะรายการเสา
create view public.v_project_so_net with (security_invoker = true) as
select project_code,
       sum(qty) filter (where item_kind <> 'บริการ' and group_product not in ('Service', '')) as qty_net,
       sum(amount) as amount_net,
       bool_or(doc_type = 'P') as has_p,
       count(*) as doc_lines
from public.sales_docs
group by project_code;

-- งานในมือ + Runway (แถวเดียว)
create view public.v_backlog with (security_invoker = true) as
with cfg as (
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = 'runway_weeks'), 4) as n,
         coalesce((select (value #>> '{}')::int from public.settings where key = 'rate_window_days'), 28) as w
),
asof as (select asof as d from public.v_data_asof),
rate as (
  select coalesce(sum(l.qty), 0) / (cfg.w / 7.0) as per_week
  from cfg
  cross join asof
  left join public.drive_logs l on l.work_date > asof.d - cfg.w and l.work_date <= asof.d
  group by cfg.w
),
bl as (
  select coalesce(sum(remain_qty) filter (where status in ('ongoing', 'on_hand')), 0) as backlog_qty,
         coalesce(sum(value_remain) filter (where status in ('ongoing', 'on_hand')), 0) as backlog_value,
         coalesce(sum(remain_qty) filter (where status = 'ongoing'), 0) as ongoing_qty,
         coalesce(sum(remain_qty) filter (where status = 'on_hand'), 0) as on_hand_qty,
         coalesce(sum(remain_qty) filter (where status = 'hold'), 0) as hold_qty,
         coalesce(sum(value_remain) filter (where status = 'hold'), 0) as hold_value
  from public.v_project_progress
)
select asof.d as asof, bl.*,
       round(rate.per_week, 1) as rate_per_week,
       cfg.n as threshold_weeks,
       case when rate.per_week > 0 then round(bl.backlog_qty / rate.per_week, 1) end as runway_weeks,
       case when rate.per_week <= 0 then 'green'
            when bl.backlog_qty / rate.per_week < cfg.n then 'red'
            when bl.backlog_qty / rate.per_week < cfg.n + 4 then 'amber'
            else 'green' end as level
from bl, rate, cfg, asof;

-- ผลงานรายวันแยกโครงการ / กลุ่มบริษัทปั้นจั่น / กะ
create view public.v_daily_totals with (security_invoker = true) as
select l.work_date, l.project_code,
       coalesce(c.category, 'subcontractor') as company_category,
       l.shift,
       sum(l.qty) as qty,
       count(distinct l.rig_name) as rigs
from public.drive_logs l
left join public.companies c on c.id = l.company_id
group by l.work_date, l.project_code, coalesce(c.category, 'subcontractor'), l.shift;

-- สถานะปั้นจั่น: ทำงานล่าสุดที่ไหน, ว่างกี่วัน, ผลงาน 14 วัน
create view public.v_rig_status with (security_invoker = true) as
with asof as (select asof as d from public.v_data_asof),
latest as (
  select distinct on (rig_name)
         rig_name, work_date as last_date, project_code as last_project, leader, company_raw, rig_type
  from public.drive_logs
  where qty > 0
  order by rig_name, work_date desc, id desc
),
agg as (
  select l.rig_name,
         coalesce(sum(l.qty) filter (where l.work_date > asof.d - 14), 0) as qty_14d,
         count(distinct l.work_date) filter (where l.work_date > asof.d - 14 and l.qty > 0) as days_14d
  from public.drive_logs l cross join asof
  group by l.rig_name
)
select latest.*, agg.qty_14d, agg.days_14d, asof.d - latest.last_date as idle_days
from latest
join agg using (rig_name)
cross join asof;

-- ยอดขายรายเดือนต่อเซลล์และประเภทเอกสาร (สุทธิ = รวมทุกประเภท เพราะ R/C เป็นค่าลบ)
create view public.v_sales_monthly with (security_invoker = true) as
select date_trunc('month', doc_date)::date as month, salesperson, doc_type,
       sum(qty) as qty, sum(amount) as amount, count(*) as lines
from public.sales_docs
group by 1, 2, 3;
