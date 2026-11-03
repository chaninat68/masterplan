-- ประชุมประจำเดือนฝ่ายวางแผน (นำเสนอในที่ประชุมทุกแผนก) — เห็น/แก้ได้เฉพาะฝ่ายวางแผน + ผู้ดูแล (can_edit)
-- ข้อมูลแต่ละหัวข้อเก็บเป็น jsonb (ฝ่ายวางแผนกรอกในเว็บ) · Project Timeline ดึงจากแผนรายวันในระบบ ไม่เก็บซ้ำ
create table public.planning_meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null unique,
  title text not null default 'Project Planning',
  status_asof date not null,
  -- {"cur": {"ready": [5], "ship": [5], "self": [5]}, "prev": {...}} ลำดับ: เสร็จ, ดำเนินการ, รอเริ่ม, รอลูกค้าตัดสินใจ, มีปัญหา
  status_counts jsonb not null default '{}'::jsonb,
  status_values jsonb not null default '{}'::jsonb, -- ล้านบาท โครงสร้างเดียวกับ status_counts
  issues jsonb not null default '[]'::jsonb,         -- โครงการมีปัญหา
  delivery jsonb not null default '{}'::jsonb,       -- แผนการจัดส่ง {rate, by_type: [...], products: [...]}
  notes text not null default '',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.planning_meetings enable row level security;
create policy planning_meetings_all on public.planning_meetings for all to authenticated
  using ((select public.can_edit())) with check ((select public.can_edit()));
