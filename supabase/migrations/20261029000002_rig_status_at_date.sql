-- สถานะปั้นจั่น ณ วันที่เลือก (หน้าฝ่ายตอก "ข้อมูลถึง" เลือกวันที่ได้) — สูตรเดียวกับ v_rig_status แต่นับเฉพาะงานถึง p_asof
create function public.rig_status_at(p_asof date)
returns table (
  rig_name text, last_date date, last_project text, leader text, company_raw text, rig_type text,
  qty_14d numeric, days_14d bigint, idle_days integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (l.rig_name) l.rig_name, l.work_date as last_date, l.project_code as last_project,
           l.leader, l.company_raw, l.rig_type
    from public.drive_logs l
    where l.qty > 0 and l.work_date <= p_asof
    order by l.rig_name, l.work_date desc, l.id desc
  ), agg as (
    select l.rig_name,
           coalesce(sum(l.qty) filter (where l.work_date > p_asof - 14), 0) as qty_14d,
           count(distinct l.work_date) filter (where l.work_date > p_asof - 14 and l.qty > 0) as days_14d
    from public.drive_logs l
    where l.work_date <= p_asof
    group by l.rig_name
  )
  select latest.rig_name, latest.last_date, latest.last_project, latest.leader, latest.company_raw, latest.rig_type,
         agg.qty_14d, agg.days_14d, p_asof - latest.last_date
  from latest join agg using (rig_name);
$$;

revoke execute on function public.rig_status_at(date) from public, anon;
grant execute on function public.rig_status_at(date) to authenticated;
