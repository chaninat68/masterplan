-- Master Planning Dashboard: ตารางหลัก
-- ดู docs/DATA-MODEL.md · วันที่เก็บเป็น ค.ศ. (date) แสดงเป็น พ.ศ. ที่หน้าเว็บ

create type public.app_role as enum ('admin', 'planning', 'manager', 'accounting', 'drive_team');
create type public.project_status as enum ('ongoing', 'on_hand', 'hold', 'completed', 'cancelled');
create type public.data_source as enum ('seed', 'import', 'manual');
create type public.sales_doc_type as enum ('P', 'R', 'C');
create type public.company_category as enum ('asia', 'asia_joint', 'subcontractor');
create type public.import_kind as enum ('queue', 'master_planning', 'sales');

-- updated_at อัตโนมัติ
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ผู้ใช้ (1 แถวต่อ auth.users) — role อ่านจากที่นี่เท่านั้น ห้ามใช้ user_metadata
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role public.app_role not null default 'drive_team',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ข้อมูลหลัก (master data)
create table public.companies (
  id bigint generated always as identity primary key,
  name text not null unique,
  category public.company_category not null default 'subcontractor'
);

create table public.company_aliases (
  raw_name text primary key,
  company_id bigint not null references public.companies (id) on delete cascade
);

create table public.rigs (
  id bigint generated always as identity primary key,
  name text not null unique,
  rig_type text not null default '',
  company_id bigint references public.companies (id) on delete set null,
  active boolean not null default true
);

create table public.pile_sizes (
  section numeric(8, 2) primary key,          -- หน้าตัด เช่น 207
  code text not null,                         -- ขนาด เช่น IP18B
  pile_type text not null default '',         -- IP / LP / SS ...
  size_no text not null default '',
  variant text not null default ''
);

create table public.customers (
  code text primary key,                      -- รหัสลูกค้า เช่น ก0000182
  name text not null,
  customer_group text not null default 'ไม่ระบุ',
  registered_at date
);

-- โครงการ (จาก Master Planning แท็บ Pile คอลัมน์ A–Q) — Master Planning คือตัวจริงของยอดสั่งซื้อ/มูลค่า
create table public.projects (
  code text primary key check (code ~ '^[A-Z][0-9]{2}-[A-Z][0-9]{3,4}$'),
  customer_name text not null default '',
  project_name text not null default '',
  agency text not null default '',
  province text not null default '',
  project_type text not null default '',
  pm text not null default '',
  sales text not null default '',
  status public.project_status not null default 'on_hand',
  order_qty numeric(12, 3) not null default 0 check (order_qty >= 0),
  contract_value numeric(16, 2) not null default 0,
  value_per_pile numeric(14, 4) not null default 0,
  start_date date,
  end_date date,
  billing_cycle text not null default '',     -- รอบส่งมอบ/วางบิล ข้อความกำหนดเอง
  end_note text not null default '',
  note text not null default '',
  order_source text not null default 'master_planning'
    check (order_source in ('master_planning', 'sales', 'queue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- แผนรายวัน (แท็บ Pile แถว Plan แปลงจากแนวกว้างเป็นแถว)
create table public.project_plan_days (
  project_code text not null references public.projects (code) on delete cascade on update cascade,
  plan_date date not null,
  planned_qty numeric(10, 3) not null check (planned_qty > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (project_code, plan_date)
);

-- Actual จากแท็บ Pile — ใช้เฉพาะวันที่ก่อน settings.legacy_actual_cutoff (คิว-วันคือตัวจริง)
create table public.project_actual_legacy (
  project_code text not null references public.projects (code) on delete cascade on update cascade,
  work_date date not null,
  qty numeric(10, 3) not null check (qty > 0),
  primary key (project_code, work_date)
);

-- หมายเหตุรายวัน: project_code ว่าง = ทั้งบริษัท (เช่น น้ำท่วม)
create table public.daily_notes (
  id bigint generated always as identity primary key,
  project_code text references public.projects (code) on delete cascade on update cascade,
  note_date date not null,
  body text not null check (length(trim(body)) > 0),
  source public.data_source not null default 'manual',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_notes_one_per_day unique nulls not distinct (project_code, note_date)
);

-- ประวัติการนำเข้าไฟล์ (ย้อนกลับได้)
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  kind public.import_kind not null,
  file_name text not null,
  storage_path text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  rows_added integer not null default 0,
  rows_duplicate integer not null default 0,
  rows_error integer not null default 0,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references public.profiles (id) on delete set null
);

-- ผลงานตอกรายวัน (ไฟล์คิว-วัน) — ตัวจริงของ Actual
-- dedupe_key = วันที่|โครงการ|ปั้นจั่น|หน้าตัด|ยาว|กะ|ต้น#ลำดับซ้ำในไฟล์
create table public.drive_logs (
  id bigint generated always as identity primary key,
  work_date date not null,
  project_code text not null references public.projects (code) on update cascade,
  owner_name text not null default '',
  agency text not null default '',
  province text not null default '',
  project_type text not null default '',
  job_status text not null default '',
  leader text not null default '',
  company_raw text not null default '',
  company_id bigint references public.companies (id) on delete set null,
  rig_name text not null,
  rig_type text not null default '',
  order_qty numeric(12, 3) not null default 0,
  standard text not null default '',
  size_code text not null default '',
  section numeric(8, 2),
  length_m numeric(6, 2),
  shift text not null default '' check (shift in ('A', 'B', '')),
  qty numeric(10, 3) not null check (qty >= 0),
  cubic_m numeric(12, 4) not null default 0,
  meters numeric(12, 2) not null default 0,
  source public.data_source not null default 'import',
  import_batch_id uuid references public.import_batches (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  dedupe_key text not null unique
);

-- เอกสารขาย (ไฟล์ SO แท็บ dataรวม) — R/C มีจำนวน/มูลค่าเป็นค่าลบอยู่แล้ว
-- project_code ไม่ผูก FK เพราะ SO มีโครงการส่งอย่างเดียว (A69-Cxxx) ที่ไม่อยู่ใน projects
create table public.sales_docs (
  id bigint generated always as identity primary key,
  doc_type public.sales_doc_type not null,
  doc_date date not null,
  so_code text not null default '',
  project_code text not null default '',
  project_name text not null default '',
  customer_code text references public.customers (code) on update cascade,
  customer_name text not null default '',
  customer_group text not null default 'ไม่ระบุ',
  item_code text not null default '',
  item_name text not null default '',
  item_kind text not null default '',         -- PILE / บริการ (R/C ว่าง)
  product text not null default '',
  group_product text not null default '',     -- IP / SC / HX / Service ...
  section numeric(8, 2),
  standard text not null default '',
  pile_form text not null default '',         -- ทด. / 2 ทช.
  length_m numeric(6, 2),
  qty numeric(12, 3) not null default 0,
  unit_price numeric(14, 2) not null default 0,
  install_fee numeric(14, 2) not null default 0,
  amount numeric(16, 2) not null default 0,
  m3 numeric(12, 4) not null default 0,
  approval_status text not null default '',
  work_status text not null default '',
  salesperson text not null default 'ไม่ระบุ',
  service_type text not null default '',
  construction_type text not null default '',
  province text not null default '',
  is_new_customer boolean not null default false,
  import_batch_id uuid references public.import_batches (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ค่าตั้งระบบ
create table public.settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.settings (key, value, description) values
  ('runway_weeks', '4', 'เตือนเร่งขายเมื่อ Runway ต่ำกว่า (สัปดาห์)'),
  ('rate_window_days', '28', 'จำนวนวันที่ใช้คำนวณอัตราตอกเฉลี่ย'),
  ('legacy_actual_cutoff', '"2026-01-01"', 'ใช้ Actual จาก Master Planning เฉพาะวันที่ก่อนวันนี้ หลังจากนั้นใช้ไฟล์คิว-วัน');

-- triggers updated_at
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger plan_days_updated_at before update on public.project_plan_days for each row execute function public.set_updated_at();
create trigger daily_notes_updated_at before update on public.daily_notes for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.settings for each row execute function public.set_updated_at();

-- indexes
create index drive_logs_project_date_idx on public.drive_logs (project_code, work_date);
create index drive_logs_date_idx on public.drive_logs (work_date);
create index drive_logs_rig_date_idx on public.drive_logs (rig_name, work_date);
create index drive_logs_batch_idx on public.drive_logs (import_batch_id) where import_batch_id is not null;
create index drive_logs_company_idx on public.drive_logs (company_id);
create index plan_days_date_idx on public.project_plan_days (plan_date);
create index daily_notes_date_idx on public.daily_notes (note_date);
create index sales_docs_date_idx on public.sales_docs (doc_date);
create index sales_docs_project_idx on public.sales_docs (project_code);
create index sales_docs_salesperson_idx on public.sales_docs (salesperson, doc_date);
create index sales_docs_customer_idx on public.sales_docs (customer_code);
create index sales_docs_batch_idx on public.sales_docs (import_batch_id) where import_batch_id is not null;
create index projects_status_idx on public.projects (status);
create index rigs_company_idx on public.rigs (company_id);
create index company_aliases_company_idx on public.company_aliases (company_id);
create index import_batches_uploaded_by_idx on public.import_batches (uploaded_by);
