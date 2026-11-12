-- Profit and Loss รายโครงการ (ไฟล์ Profit and Loss.xlsx แท็บ TS, ผู้ใช้สั่ง 12 พ.ย. 2569)
-- นำเข้า 1 ครั้ง = 1 ชุดข้อมูล (pnl_reports) หน้าเว็บแสดงชุดล่าสุด · ย้อนกลับ = ลบชุดนั้น
-- เห็นเฉพาะ can_see_sales() (มีมูลค่าเงิน) · นำเข้าได้เฉพาะ can_edit()
create table public.pnl_reports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  params jsonb not null default '[]',          -- อัตราที่ใช้คำนวณ เช่น OH บริหาร 700, OH ผลิต 350
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index pnl_reports_batch_idx on public.pnl_reports (import_batch_id);

create table public.pnl_projects (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.pnl_reports (id) on delete cascade,
  sort integer not null,
  project_code text,                             -- รหัสโครงการ (ถ้ามี)
  ref_text text not null default '',             -- ข้อความรหัสในไฟล์ เช่น "A69-A031,032"
  customer text not null default '',
  project text not null default '',
  location text not null default '',
  product text not null default '',
  distance numeric(12,2),
  revenue numeric(16,2),                         -- รายได้รวม (ขาย + ตอก + บริการ)
  piles numeric(12,2),
  volume numeric(14,4),
  trips numeric(12,2),
  lines jsonb not null default '{}'              -- บรรทัด P&L: key → บาท
);
create index pnl_projects_report_idx on public.pnl_projects (report_id, sort);

alter table public.pnl_reports enable row level security;
alter table public.pnl_projects enable row level security;
create policy pnl_reports_select on public.pnl_reports for select to authenticated using ((select public.can_see_sales()));
create policy pnl_reports_write on public.pnl_reports for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy pnl_projects_select on public.pnl_projects for select to authenticated using ((select public.can_see_sales()));
create policy pnl_projects_write on public.pnl_projects for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));

create or replace function public.import_pnl(p_file_name text, p_params jsonb, p_projects jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_id uuid;
  v_rows integer;
begin
  if not public.can_edit() then
    raise exception 'ไม่มีสิทธิ์นำเข้าข้อมูล' using errcode = '42501';
  end if;

  insert into public.import_batches (kind, file_name, uploaded_by)
  values ('pnl', p_file_name, (select auth.uid()))
  returning id into v_batch;

  insert into public.pnl_reports (file_name, params, import_batch_id)
  values (p_file_name, coalesce(p_params, '[]'), v_batch)
  returning id into v_id;

  insert into public.pnl_projects (report_id, sort, project_code, ref_text, customer, project, location, product,
                                   distance, revenue, piles, volume, trips, lines)
  select v_id, x.sort, nullif(x.project_code, ''), coalesce(x.ref_text, ''), coalesce(x.customer, ''), coalesce(x.project, ''),
         coalesce(x.location, ''), coalesce(x.product, ''), x.distance, x.revenue, x.piles, x.volume, x.trips, coalesce(x.lines, '{}')
  from jsonb_to_recordset(p_projects) as x(sort integer, project_code text, ref_text text, customer text, project text, location text,
    product text, distance numeric, revenue numeric, piles numeric, volume numeric, trips numeric, lines jsonb);
  get diagnostics v_rows = row_count;

  update public.import_batches set rows_added = v_rows where id = v_batch;
  return jsonb_build_object('batch_id', v_batch, 'report_id', v_id, 'projects', v_rows);
end;
$$;
revoke execute on function public.import_pnl(text, jsonb, jsonb) from public, anon;
grant execute on function public.import_pnl(text, jsonb, jsonb) to authenticated;

-- ย้อนกลับ: เพิ่ม pnl (ลบชุดข้อมูลของการนำเข้านั้น)
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
  elsif v_kind = 'pnl' then
    select count(*) into v_deleted from public.pnl_projects p join public.pnl_reports r on r.id = p.report_id where r.import_batch_id = p_batch;
    delete from public.pnl_reports where import_batch_id = p_batch;
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
    raise exception 'ย้อนกลับได้เฉพาะการนำเข้าไฟล์คิว-วัน ไฟล์ประชุมแผนกขาย และ Profit and Loss';
  end if;

  update public.import_batches set undone_at = now(), undone_by = (select auth.uid()) where id = p_batch;
  return v_deleted;
end;
$$;
