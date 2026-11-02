-- ประชุมแผนกขายประจำสัปดาห์ (ไฟล์ "Sales Update dd-mm-yy.xlsx") — 1 ไฟล์ = 1 ครั้งประชุม เก็บย้อนหลังเพื่อเทียบสัปดาห์ก่อน
-- ตัวเลขยอดขาย/เป้าใช้ตามไฟล์ (ผู้ใช้ยืนยัน 3 พ.ย. 2569) · มูลค่าเก็บเป็นบาท (ไฟล์แสดงเป็นล้าน แต่ค่าดิบเป็นบาท)
-- สิทธิ์: เห็น = can_see_sales() (ฝ่ายตอก/ผลิตไม่เห็น), แก้ = can_edit()

create table public.sales_meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null unique,
  period_month date not null,               -- เดือนที่สรุปยอด (วันที่ 1)
  title text not null default '',
  week_labels text[] not null default '{}', -- เช่น {"1-4 ต.ค.","5-11 ต.ค.",...}
  remain_label text not null default '',    -- ช่วงที่เหลือของเดือน เช่น "30-31 ต.ค."
  file_name text not null default '',
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- สรุปยอดรายเซลล์ (แท็บ สรุปยอด): เป้าเดือนนี้ + ยอดขายรายสัปดาห์
create table public.sales_meeting_people (
  meeting_id uuid not null references public.sales_meetings (id) on delete cascade,
  salesperson text not null,
  sort integer not null default 0,
  target numeric(16,2) not null default 0,
  weeks numeric(16,2)[] not null default '{}',
  primary key (meeting_id, salesperson)
);

-- ยอดขายจริง / เป้า ตามผลิตภัณฑ์รายเดือน (แท็บ สรุปยอด ฝั่งขวา + Sheet1)
create table public.sales_product_months (
  meeting_id uuid not null references public.sales_meetings (id) on delete cascade,
  product text not null,
  month date not null,
  actual numeric(16,2),
  target numeric(16,2),
  primary key (meeting_id, product, month)
);

-- รายการงานที่คาดว่าจะได้ (แท็บ DATA รวม)
create table public.sales_pipeline (
  id bigint generated always as identity primary key,
  meeting_id uuid not null references public.sales_meetings (id) on delete cascade,
  row_no integer not null default 0,
  salesperson text not null default '',
  product text not null default '',
  first_quote date,
  last_quote date,
  customer text not null default '',
  project text not null default '',
  value numeric(16,2) not null default 0,
  category text not null default '' check (category in ('', 'base', 'best', 'lost', 'excluded', 'cancelled')),
  expected_month date,                      -- เดือนที่คาดว่าจะได้ (วันที่ 1) — ว่าง = ไม่ระบุ
  expected_text text not null default '',   -- ข้อความเดิมในไฟล์ เช่น "30 ต.ค.", "พ.ค.70"
  status_note text not null default '',
  start_date date,
  duration text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create index sales_pipeline_meeting_idx on public.sales_pipeline (meeting_id);

alter table public.sales_meetings enable row level security;
alter table public.sales_meeting_people enable row level security;
alter table public.sales_product_months enable row level security;
alter table public.sales_pipeline enable row level security;

create policy sales_meetings_select on public.sales_meetings for select to authenticated using ((select public.can_see_sales()));
create policy sales_meetings_write on public.sales_meetings for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy sales_meeting_people_select on public.sales_meeting_people for select to authenticated using ((select public.can_see_sales()));
create policy sales_meeting_people_write on public.sales_meeting_people for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy sales_product_months_select on public.sales_product_months for select to authenticated using ((select public.can_see_sales()));
create policy sales_product_months_write on public.sales_product_months for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy sales_pipeline_select on public.sales_pipeline for select to authenticated using ((select public.can_see_sales()));
create policy sales_pipeline_write on public.sales_pipeline for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));

-- นำเข้า 1 ครั้งประชุม: วันที่ประชุมซ้ำ = แทนที่ของเดิม
create function public.import_sales_meeting(p_file_name text, p_meeting jsonb, p_people jsonb, p_products jsonb, p_pipeline jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_id uuid;
  v_people integer;
  v_pipeline integer;
  v_replaced integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์นำเข้าข้อมูล' using errcode = '42501';
  end if;

  insert into public.import_batches (kind, file_name, uploaded_by)
  values ('sales_meeting', p_file_name, (select auth.uid()))
  returning id into v_batch;

  delete from public.sales_meetings where meeting_date = (p_meeting ->> 'meeting_date')::date;
  get diagnostics v_replaced = row_count;

  insert into public.sales_meetings (meeting_date, period_month, title, week_labels, remain_label, file_name, import_batch_id)
  values ((p_meeting ->> 'meeting_date')::date, (p_meeting ->> 'period_month')::date, coalesce(p_meeting ->> 'title', ''),
          coalesce(array(select jsonb_array_elements_text(p_meeting -> 'week_labels')), '{}'),
          coalesce(p_meeting ->> 'remain_label', ''), p_file_name, v_batch)
  returning id into v_id;

  insert into public.sales_meeting_people (meeting_id, salesperson, sort, target, weeks)
  select v_id, x.salesperson, x.sort, coalesce(x.target, 0),
         coalesce(array(select coalesce((w)::numeric, 0) from jsonb_array_elements_text(x.weeks) w), '{}')
  from jsonb_to_recordset(p_people) as x(salesperson text, sort integer, target numeric, weeks jsonb);
  get diagnostics v_people = row_count;

  insert into public.sales_product_months (meeting_id, product, month, actual, target)
  select v_id, x.product, x.month, x.actual, x.target
  from jsonb_to_recordset(p_products) as x(product text, month date, actual numeric, target numeric);

  insert into public.sales_pipeline (meeting_id, row_no, salesperson, product, first_quote, last_quote, customer, project, value,
                                     category, expected_month, expected_text, status_note, start_date, duration, updated_by)
  select v_id, x.row_no, coalesce(x.salesperson, ''), coalesce(x.product, ''), x.first_quote, x.last_quote,
         coalesce(x.customer, ''), coalesce(x.project, ''), coalesce(x.value, 0), coalesce(x.category, ''), x.expected_month,
         coalesce(x.expected_text, ''), coalesce(x.status_note, ''), x.start_date, coalesce(x.duration, ''), (select auth.uid())
  from jsonb_to_recordset(p_pipeline) as x(row_no integer, salesperson text, product text, first_quote date, last_quote date,
    customer text, project text, value numeric, category text, expected_month date, expected_text text, status_note text,
    start_date date, duration text);
  get diagnostics v_pipeline = row_count;

  update public.import_batches set rows_added = v_pipeline, rows_duplicate = v_replaced where id = v_batch;
  return jsonb_build_object('batch_id', v_batch, 'meeting_id', v_id, 'people', v_people, 'pipeline', v_pipeline, 'replaced', v_replaced);
end;
$$;
revoke execute on function public.import_sales_meeting(text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_sales_meeting(text, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ย้อนกลับ: คิว-วัน (เหมือนเดิม) และไฟล์ประชุมแผนกขาย (ลบครั้งประชุมที่นำเข้า)
create or replace function public.undo_import(p_batch uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.import_kind;
  v_deleted integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  select kind into v_kind from public.import_batches where id = p_batch and undone_at is null;
  if v_kind is null then
    raise exception 'ไม่พบรายการนำเข้า หรือย้อนกลับไปแล้ว';
  end if;

  if v_kind = 'sales_meeting' then
    delete from public.sales_meetings where import_batch_id = p_batch;
    get diagnostics v_deleted = row_count;
  elsif v_kind = 'queue' then
    delete from public.drive_logs where import_batch_id = p_batch;
    get diagnostics v_deleted = row_count;

    insert into public.drive_logs (
      work_date, project_code, owner_name, agency, province, project_type, job_status, leader,
      company_raw, company_id, rig_name, rig_type, order_qty, standard, size_code, section, length_m,
      shift, qty, cubic_m, meters, source, import_batch_id, created_by, created_at, dedupe_key)
    select work_date, project_code, owner_name, agency, province, project_type, job_status, leader,
           company_raw, company_id, rig_name, rig_type, order_qty, standard, size_code, section, length_m,
           shift, qty, cubic_m, meters, source, import_batch_id, created_by, created_at, dedupe_key
    from public.drive_logs_removed where removed_by_batch = p_batch
    on conflict (dedupe_key) do nothing;
    delete from public.drive_logs_removed where removed_by_batch = p_batch;

    perform public.refresh_queue_order_qty();
  else
    raise exception 'ย้อนกลับได้เฉพาะการนำเข้าไฟล์คิว-วัน และไฟล์ประชุมแผนกขาย';
  end if;

  update public.import_batches set undone_at = now(), undone_by = (select auth.uid()) where id = p_batch;
  return v_deleted;
end;
$$;
