-- กำหนดแล้วเสร็จ (projects.end_date) = วันสุดท้ายที่มีแผนงาน (ผู้ใช้สั่ง 12 พ.ย. 2569)
-- อัปเดตอัตโนมัติทุกครั้งที่แผนเปลี่ยน (แก้ในเว็บ / อัปโหลดไฟล์แผน / นำเข้า Master Planning) — โครงการที่ไม่มีแผนคงค่าเดิม

-- trigger แบบ statement + transition table (insert/update ใช้ new_rows, delete ใช้ old_rows)
create or replace function public.sync_end_date_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.projects p set end_date = m.last_day
    from (select d.project_code as code, max(d.plan_date) as last_day
            from public.project_plan_days d
           where d.project_code in (select project_code from new_rows)
           group by d.project_code) m
   where p.code = m.code and p.end_date is distinct from m.last_day;
  return null;
end; $$;

create or replace function public.sync_end_date_del()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.projects p set end_date = m.last_day
    from (select d.project_code as code, max(d.plan_date) as last_day
            from public.project_plan_days d
           where d.project_code in (select project_code from old_rows)
           group by d.project_code) m
   where p.code = m.code and p.end_date is distinct from m.last_day;
  return null;
end; $$;

create trigger project_plan_days_end_ins after insert on public.project_plan_days
  referencing new table as new_rows for each statement execute function public.sync_end_date_ins();
create trigger project_plan_days_end_upd after update on public.project_plan_days
  referencing new table as new_rows for each statement execute function public.sync_end_date_ins();
create trigger project_plan_days_end_del after delete on public.project_plan_days
  referencing old table as old_rows for each statement execute function public.sync_end_date_del();

revoke all on function public.sync_end_date_ins() from public, anon, authenticated;
revoke all on function public.sync_end_date_del() from public, anon, authenticated;

-- ปรับข้อมูลปัจจุบัน
update public.projects p set end_date = m.last_day
  from (select project_code as code, max(plan_date) as last_day from public.project_plan_days group by project_code) m
 where p.code = m.code and p.end_date is distinct from m.last_day;
