-- ผู้ใช้สั่ง 21 พ.ย. 2569:
-- 1) admin/planning เพิ่ม / ลบ / เปลี่ยนสถานะโครงการในหน้าแผน/ผลงานได้
-- 2) นำเข้าไฟล์ SO แล้วมีโครงการใหม่ที่ยังไม่อยู่ในระบบ → สร้างเป็น "รอเริ่ม" ให้ฝ่ายวางแผนวางแผน
--    เงื่อนไข: มีใบ P, ประเภทบริการ "พร้อมตอก" (ส่งอย่างเดียว/รับเอง ไม่มีงานตอก), รหัสปีไม่เก่ากว่าปีของไฟล์ SO,
--    จำนวนเสาสุทธิ > 0 และไม่เคยถูกลบโดยฝ่ายวางแผน (projects_deleted)

create table public.projects_deleted (
  code text primary key,
  project_name text not null default '',
  deleted_at timestamptz not null default now(),
  deleted_by uuid
);
alter table public.projects_deleted enable row level security;
create policy projects_deleted_select on public.projects_deleted for select to authenticated using ((select public.can_edit()));
grant select on public.projects_deleted to authenticated;

create or replace function public.create_projects_from_sales()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yr integer;
  v_codes text[];
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  select (extract(year from min(doc_date))::int + 543) % 100 into v_yr from public.sales_docs;
  if v_yr is null then
    return '{}';
  end if;

  with so as (
    select project_code,
           coalesce(sum(qty) filter (where group_product in ('BC', 'HX', 'IP', 'SC')), 0) as qty,
           (array_agg(salesperson order by (doc_type = 'P') desc, doc_date desc) filter (where salesperson <> ''))[1] as sales,
           min(doc_date) filter (where doc_type = 'P') as first_p
    from public.sales_docs
    where project_code ~ '^[A-Z][0-9]{2}-[A-Z][0-9]{3,4}$' and substr(project_code, 2, 2)::int >= v_yr
    group by project_code
    having bool_or(doc_type = 'P') and bool_or(service_type = 'พร้อมตอก')
  ), ins as (
    insert into public.projects (code, sales, status, order_qty, order_source, note, updated_by)
    select so.project_code, coalesce(so.sales, ''), 'on_hand', so.qty, 'sales',
           'สร้างอัตโนมัติจากไฟล์ SO (ใบ P ' || to_char(so.first_p, 'DD/MM/') || (extract(year from so.first_p)::int + 543) || ') — รอวางแผน',
           (select auth.uid())
    from so
    where so.qty > 0
      and not exists (select 1 from public.projects p where p.code = so.project_code)
      and not exists (select 1 from public.projects_deleted d where d.code = so.project_code)
    returning code
  )
  select coalesce(array_agg(code order by code), '{}') into v_codes from ins;
  return v_codes;
end;
$$;
revoke execute on function public.create_projects_from_sales() from public, anon;
grant execute on function public.create_projects_from_sales() to authenticated;

-- ลบโครงการ: ได้เฉพาะที่ยังไม่มีผลงานตอก (คิว-วัน / Actual ก่อนปี 69) — แผน หมายเหตุ ประวัติอัปโหลดแผน ลบตาม (cascade)
create or replace function public.delete_project(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  select project_name into v_name from public.projects where code = p_code;
  if not found then
    raise exception 'ไม่พบโครงการ %', p_code;
  end if;
  if exists (select 1 from public.drive_logs where project_code = p_code)
     or exists (select 1 from public.drive_logs_removed where project_code = p_code)
     or exists (select 1 from public.project_actual_legacy where project_code = p_code) then
    raise exception 'ลบไม่ได้ — โครงการ % มีผลงานตอกแล้ว (เปลี่ยนสถานะเป็น "ยกเลิก" แทน)', p_code;
  end if;
  delete from public.projects where code = p_code;
  insert into public.projects_deleted (code, project_name, deleted_by)
  values (p_code, v_name, (select auth.uid()))
  on conflict (code) do update set project_name = excluded.project_name, deleted_at = now(), deleted_by = excluded.deleted_by;
end;
$$;
revoke execute on function public.delete_project(text) from public, anon;
grant execute on function public.delete_project(text) to authenticated;

-- เพิ่มโครงการเองในเว็บ = ล้างออกจากรายการที่เคยลบ
create or replace function public.projects_undelete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.projects_deleted where code = new.code;
  return new;
end;
$$;
create trigger projects_undelete after insert on public.projects for each row execute function public.projects_undelete();
