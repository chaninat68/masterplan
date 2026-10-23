-- สิทธิ์: role อ่านจาก profiles เท่านั้น + RLS ทุกตาราง (ดูตารางสิทธิ์ใน docs/DATA-MODEL.md)

-- role ของผู้ใช้ปัจจุบัน (null ถ้าไม่ได้ล็อกอินหรือถูกปิดใช้งาน)
create or replace function public.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active
$$;

-- แก้ไขข้อมูลงานได้ไหม (admin, planning)
create or replace function public.can_edit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role() in ('admin', 'planning'), false)
$$;

-- เห็นข้อมูลขาย/การเงินได้ไหม (ทุกบทบาทยกเว้นฝ่ายตอก)
create or replace function public.can_see_sales()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role() in ('admin', 'planning', 'manager', 'accounting'), false)
$$;

revoke execute on function public.my_role() from public, anon;
revoke execute on function public.can_edit() from public, anon;
revoke execute on function public.can_see_sales() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.can_edit() to authenticated;
grant execute on function public.can_see_sales() to authenticated;

-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่ (role เริ่มต้น = drive_team ดูอย่างเดียว, admin เปลี่ยนให้ภายหลัง)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- เปิด RLS ทุกตาราง
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_aliases enable row level security;
alter table public.rigs enable row level security;
alter table public.pile_sizes enable row level security;
alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.project_plan_days enable row level security;
alter table public.project_actual_legacy enable row level security;
alter table public.daily_notes enable row level security;
alter table public.import_batches enable row level security;
alter table public.drive_logs enable row level security;
alter table public.sales_docs enable row level security;
alter table public.settings enable row level security;

-- profiles: อ่านของตัวเอง, admin อ่าน/แก้ทั้งหมด (เปลี่ยน role ได้เฉพาะ admin)
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.my_role()) = 'admin');
create policy profiles_update_admin on public.profiles for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

-- ข้อมูลงาน: ทุกบทบาทที่ใช้งานอยู่อ่านได้, admin/planning แก้ได้
do $$
declare t text;
begin
  foreach t in array array['companies', 'company_aliases', 'rigs', 'pile_sizes', 'projects',
                           'project_plan_days', 'project_actual_legacy', 'daily_notes', 'drive_logs']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using ((select public.my_role()) is not null)', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check ((select public.can_edit()))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using ((select public.can_edit())) with check ((select public.can_edit()))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using ((select public.can_edit()))', t);
  end loop;
end $$;

-- ข้อมูลขาย: ฝ่ายตอกไม่เห็น, นำเข้า/แก้ได้เฉพาะ admin/planning
create policy sales_docs_select on public.sales_docs for select to authenticated using ((select public.can_see_sales()));
create policy sales_docs_insert on public.sales_docs for insert to authenticated with check ((select public.can_edit()));
create policy sales_docs_update on public.sales_docs for update to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy sales_docs_delete on public.sales_docs for delete to authenticated using ((select public.can_edit()));

create policy customers_select on public.customers for select to authenticated using ((select public.can_see_sales()));
create policy customers_insert on public.customers for insert to authenticated with check ((select public.can_edit()));
create policy customers_update on public.customers for update to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy customers_delete on public.customers for delete to authenticated using ((select public.can_edit()));

-- ประวัติการนำเข้า: admin/planning เท่านั้น
create policy import_batches_all on public.import_batches for all to authenticated
  using ((select public.can_edit())) with check ((select public.can_edit()));

-- ค่าตั้ง: ทุกบทบาทอ่านได้ (view ใช้คำนวณ), admin/planning แก้ได้ (เช่น N สัปดาห์)
create policy settings_select on public.settings for select to authenticated using ((select public.my_role()) is not null);
create policy settings_update on public.settings for update to authenticated
  using ((select public.can_edit())) with check ((select public.can_edit()));
