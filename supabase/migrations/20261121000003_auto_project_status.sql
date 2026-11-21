-- สถานะโครงการอัตโนมัติ (ผู้ใช้สั่ง 21 พ.ย. 2569)
-- 1) คงเหลือ = 0 (ตอกแล้ว >= ยอดสั่งซื้อ > 0) → แล้วเสร็จ (จาก Ongoing / On Hand / Hold)
-- 2) โครงการแล้วเสร็จ: วันจบงาน (end_date) = วันสุดท้ายที่มีผลงานตอก
-- 3) On Hand ที่มีผลงานตอกแล้ว → Ongoing
-- รันเมื่อ drive_logs เปลี่ยน (นำเข้าคิว-วัน / กรอกเอง) และเมื่อยอดสั่งซื้อเปลี่ยน (นำเข้า SO / Master Planning / แก้ในเว็บ)

create or replace function public.apply_project_status_rules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 3) On Hand ที่เริ่มตอกแล้ว → Ongoing (ยังไม่ครบยอด)
  update public.projects p set status = 'ongoing'
    from (select project_code as code, sum(qty) as done, max(work_date) as last_day from public.v_project_actual_days where qty > 0 group by project_code) a
   where a.code = p.code and p.status = 'on_hand' and a.done > 0 and not (p.order_qty > 0 and a.done >= p.order_qty);

  -- 1) ตอกครบยอด → แล้วเสร็จ (trigger projects_completed_end_date ตั้งวันจบงาน)
  update public.projects p set status = 'completed'
    from (select project_code as code, sum(qty) as done, max(work_date) as last_day from public.v_project_actual_days where qty > 0 group by project_code) a
   where a.code = p.code and p.status in ('ongoing', 'on_hand', 'hold') and p.order_qty > 0 and a.done >= p.order_qty;

  -- 2) แล้วเสร็จ: วันจบงาน = วันสุดท้ายที่มีผลงาน
  update public.projects p set end_date = a.last_day
    from (select project_code as code, sum(qty) as done, max(work_date) as last_day from public.v_project_actual_days where qty > 0 group by project_code) a
   where a.code = p.code and p.status = 'completed' and p.end_date is distinct from a.last_day;
end;
$$;
revoke execute on function public.apply_project_status_rules() from public, anon, authenticated;

-- เปลี่ยนเป็นแล้วเสร็จ (อัตโนมัติหรือเลือกในเว็บ) → วันจบงาน = วันสุดท้ายที่มีผลงาน
create or replace function public.projects_completed_end_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last date;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select max(work_date) into v_last from public.v_project_actual_days where project_code = new.code and qty > 0;
    if v_last is not null then
      new.end_date := v_last;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.projects_completed_end_date() from public, anon, authenticated;
create trigger projects_completed_end_date before update of status on public.projects
  for each row execute function public.projects_completed_end_date();

create or replace function public.trg_apply_project_status_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_project_status_rules();
  return null;
end;
$$;
revoke execute on function public.trg_apply_project_status_rules() from public, anon, authenticated;
create trigger drive_logs_status_rules after insert or update or delete on public.drive_logs
  for each statement execute function public.trg_apply_project_status_rules();
create trigger projects_order_qty_status_rules after update of order_qty on public.projects
  for each statement execute function public.trg_apply_project_status_rules();

-- แผนเปลี่ยน: ไม่ทับวันจบงานของโครงการแล้วเสร็จ (ใช้วันสุดท้ายที่มีผลงานแทน)
create or replace function public.sync_end_date_ins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects p set end_date = m.last_day
    from (select d.project_code as code, max(d.plan_date) as last_day
            from public.project_plan_days d
           where d.project_code in (select project_code from new_rows)
           group by d.project_code) m
   where p.code = m.code and p.status <> 'completed' and p.end_date is distinct from m.last_day;
  return null;
end; $$;

create or replace function public.sync_end_date_del()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects p set end_date = m.last_day
    from (select d.project_code as code, max(d.plan_date) as last_day
            from public.project_plan_days d
           where d.project_code in (select project_code from old_rows)
           group by d.project_code) m
   where p.code = m.code and p.status <> 'completed' and p.end_date is distinct from m.last_day;
  return null;
end; $$;

-- ปรับข้อมูลปัจจุบันตามกฎ
select public.apply_project_status_rules();
