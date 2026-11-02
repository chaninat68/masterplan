-- สิทธิ์ตามตารางของผู้ใช้ (3 พ.ย. 2569): ฝ่ายตอก / ฝ่ายผลิต ห้ามเห็นตัวเลขมูลค่าเงินทุกหน้า — กันที่ฐานข้อมูล
-- * มูลค่าโครงการ / มูลค่าเฉลี่ยต่อต้น อ่านจากตาราง projects ตรงๆ ไม่ได้ (สิทธิ์ระดับคอลัมน์)
--   ต้องอ่านผ่าน project_money() ซึ่งคืนค่าเฉพาะบทบาทที่ can_see_sales() (admin/planning/manager/accounting)
-- * v_project_progress / project_progress_at ใช้ project_money() → บทบาทอื่นได้มูลค่าเป็นค่าว่าง
-- * sales_docs / customers กันด้วย can_see_sales() อยู่แล้ว (production ไม่อยู่ในรายชื่อ)
-- * ประวัติการนำเข้า: ทุกบทบาทดูได้ (นำเข้า/ย้อนกลับได้เฉพาะ can_edit)

revoke select on public.projects from anon, authenticated;
grant select (code, customer_name, project_name, agency, province, project_type, pm, sales, status, order_qty,
              start_date, end_date, billing_cycle, end_note, note, order_source, created_at, updated_at, updated_by)
  on public.projects to authenticated;

create function public.project_money()
returns table (code text, contract_value numeric, value_per_pile numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, p.contract_value, p.value_per_pile
  from public.projects p
  where public.can_see_sales();
$$;
revoke execute on function public.project_money() from public, anon;
grant execute on function public.project_money() to authenticated;

create view public.v_project_money with (security_invoker = true) as
  select code, contract_value, value_per_pile from public.project_money();

create or replace view public.v_project_progress with (security_invoker = true) as
 WITH asof AS (
         SELECT v_data_asof.asof AS d
           FROM public.v_data_asof
        ), act AS (
         SELECT a.project_code,
            sum(a.qty) AS done,
            sum(a.qty) FILTER (WHERE ((a.work_date > (asof.d - 14)) AND (a.work_date <= asof.d))) AS last14
           FROM (public.v_project_actual_days a
             CROSS JOIN asof)
          GROUP BY a.project_code
        ), pl AS (
         SELECT p.project_code,
            sum(p.planned_qty) AS plan_total,
            sum(p.planned_qty) FILTER (WHERE (p.plan_date <= asof.d)) AS plan_to_date
           FROM (public.project_plan_days p
             CROSS JOIN asof)
          GROUP BY p.project_code
        ), base AS (
         SELECT pr.code AS project_code,
            pr.status,
            pr.order_qty,
            (m.value_per_pile)::numeric(14,4) AS value_per_pile,
            asof.d AS asof,
            COALESCE(act.done, (0)::numeric) AS done_qty,
            COALESCE(act.last14, (0)::numeric) AS last14_qty,
            COALESCE(pl.plan_to_date, (0)::numeric) AS plan_to_date,
            COALESCE(pl.plan_total, (0)::numeric) AS plan_total,
            (pl.plan_total IS NOT NULL) AS has_plan
           FROM ((((public.projects pr
             CROSS JOIN asof)
             LEFT JOIN public.project_money() m ON ((m.code = pr.code)))
             LEFT JOIN act ON ((act.project_code = pr.code)))
             LEFT JOIN pl ON ((pl.project_code = pr.code)))
        )
 SELECT project_code,
    status,
    asof,
    order_qty,
    value_per_pile,
    done_qty,
    plan_to_date,
    plan_total,
    has_plan,
    (done_qty - plan_to_date) AS ahead_behind,
    GREATEST((order_qty - done_qty), (0)::numeric) AS remain_qty,
    round((last14_qty / 14.0), 3) AS rate_per_day,
        CASE
            WHEN ((GREATEST((order_qty - done_qty), (0)::numeric) > (0)::numeric) AND (last14_qty > (0)::numeric)) THEN (asof + (ceil((GREATEST((order_qty - done_qty), (0)::numeric) / (last14_qty / 14.0))))::integer)
            ELSE NULL::date
        END AS eta,
        CASE
            WHEN (order_qty > (0)::numeric) THEN LEAST((1)::numeric, (done_qty / order_qty))
            ELSE (0)::numeric
        END AS pct_done,
        CASE
            WHEN (order_qty > (0)::numeric) THEN LEAST((1)::numeric, (plan_to_date / order_qty))
            ELSE (0)::numeric
        END AS pct_plan,
    round((done_qty * value_per_pile), 2) AS value_done,
    round((GREATEST((order_qty - done_qty), (0)::numeric) * value_per_pile), 2) AS value_remain
   FROM base;

create or replace function public.project_progress_at(p_asof date)
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
    select pr.code as project_code, pr.status, pr.order_qty, m.value_per_pile,
           coalesce(act.done, 0) as done_qty, coalesce(act.last14, 0) as last14_qty,
           coalesce(pl.plan_to_date, 0) as plan_to_date, coalesce(pl.plan_total, 0) as plan_total,
           pl.plan_total is not null as has_plan
    from public.projects pr
    left join public.project_money() m on m.code = pr.code
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

create policy import_batches_select on public.import_batches for select to authenticated
  using ((select public.my_role()) is not null);
