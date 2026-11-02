-- ดูข้อมูลย้อนหลัง ณ วันที่เลือก ("ข้อมูลถึง" เลือกวันที่ได้)
-- สูตรเดียวกับ v_project_progress / v_backlog แต่ใช้ p_asof แทนวันที่ข้อมูลล่าสุด และนับผลงานถึง p_asof เท่านั้น
-- (สถานะ/ยอดสั่งซื้อเป็นค่าปัจจุบัน — ไม่มีประวัติย้อนหลัง)
create function public.project_progress_at(p_asof date)
returns table (
  project_code text, status public.project_status, asof date, order_qty numeric, value_per_pile numeric,
  done_qty numeric, plan_to_date numeric, plan_total numeric, has_plan boolean, ahead_behind numeric,
  remain_qty numeric, rate_per_day numeric, eta date, pct_done numeric, pct_plan numeric,
  value_done numeric, value_remain numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with act as (
    select a.project_code, sum(a.qty) as done,
           sum(a.qty) filter (where a.work_date > p_asof - 14) as last14
    from public.v_project_actual_days a
    where a.work_date <= p_asof
    group by a.project_code
  ), pl as (
    select p.project_code, sum(p.planned_qty) as plan_total,
           sum(p.planned_qty) filter (where p.plan_date <= p_asof) as plan_to_date
    from public.project_plan_days p
    group by p.project_code
  ), base as (
    select pr.code as project_code, pr.status, pr.order_qty, pr.value_per_pile,
           coalesce(act.done, 0) as done_qty, coalesce(act.last14, 0) as last14_qty,
           coalesce(pl.plan_to_date, 0) as plan_to_date, coalesce(pl.plan_total, 0) as plan_total,
           pl.plan_total is not null as has_plan
    from public.projects pr
    left join act on act.project_code = pr.code
    left join pl on pl.project_code = pr.code
  )
  select project_code, status, p_asof, order_qty, value_per_pile, done_qty, plan_to_date, plan_total, has_plan,
         done_qty - plan_to_date,
         greatest(order_qty - done_qty, 0),
         round(last14_qty / 14.0, 3),
         case when greatest(order_qty - done_qty, 0) > 0 and last14_qty > 0
              then p_asof + ceil(greatest(order_qty - done_qty, 0) / (last14_qty / 14.0))::integer end,
         case when order_qty > 0 then least(1, done_qty / order_qty) else 0 end,
         case when order_qty > 0 then least(1, plan_to_date / order_qty) else 0 end,
         round(done_qty * value_per_pile, 2),
         round(greatest(order_qty - done_qty, 0) * value_per_pile, 2)
  from base;
$$;

create function public.backlog_at(p_asof date)
returns table (
  asof date, backlog_qty numeric, backlog_value numeric, ongoing_qty numeric, on_hand_qty numeric, hold_qty numeric,
  hold_value numeric, rate_per_week numeric, threshold_weeks numeric, runway_weeks numeric, level text)
language sql
stable
security invoker
set search_path = ''
as $$
  with cfg as (
    select coalesce((select (value #>> '{}')::numeric from public.settings where key = 'runway_weeks'), 4) as n,
           coalesce((select (value #>> '{}')::integer from public.settings where key = 'rate_window_days'), 28) as w
  ), rate as (
    select coalesce(sum(l.qty), 0) / (cfg.w / 7.0) as per_week
    from cfg
    left join public.drive_logs l on l.work_date > p_asof - cfg.w and l.work_date <= p_asof
    group by cfg.w
  ), bl as (
    select coalesce(sum(remain_qty) filter (where status in ('ongoing', 'on_hand')), 0) as backlog_qty,
           coalesce(sum(value_remain) filter (where status in ('ongoing', 'on_hand')), 0) as backlog_value,
           coalesce(sum(remain_qty) filter (where status = 'ongoing'), 0) as ongoing_qty,
           coalesce(sum(remain_qty) filter (where status = 'on_hand'), 0) as on_hand_qty,
           coalesce(sum(remain_qty) filter (where status = 'hold'), 0) as hold_qty,
           coalesce(sum(value_remain) filter (where status = 'hold'), 0) as hold_value
    from public.project_progress_at(p_asof)
  )
  select p_asof, bl.backlog_qty, bl.backlog_value, bl.ongoing_qty, bl.on_hand_qty, bl.hold_qty, bl.hold_value,
         round(rate.per_week, 1), cfg.n,
         case when rate.per_week > 0 then round(bl.backlog_qty / rate.per_week, 1) end,
         case when rate.per_week <= 0 then 'green'
              when bl.backlog_qty / rate.per_week < cfg.n then 'red'
              when bl.backlog_qty / rate.per_week < cfg.n + 4 then 'amber'
              else 'green' end
  from bl, rate, cfg;
$$;

revoke execute on function public.project_progress_at(date) from public, anon;
grant execute on function public.project_progress_at(date) to authenticated;
revoke execute on function public.backlog_at(date) from public, anon;
grant execute on function public.backlog_at(date) to authenticated;
