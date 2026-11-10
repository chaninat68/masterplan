-- ประชุมแผนกขาย: คอลัมน์ "ประมาณการ สัปดาห์ที่ N" ในแท็บ สรุปยอด (ผู้ใช้สั่ง 6 พ.ย. 2569)
-- ค่าในไฟล์ = Σ งาน Base ที่ระบุสัปดาห์/วัน (เช่น "พ.ย. Week 2", "30 ต.ค.") + ตัวเลขที่พิมพ์เพิ่มเอง
-- next_adj = ส่วนที่พิมพ์เพิ่มเอง (ค่าในไฟล์ − Σ รายการงาน) → บวกเข้าประมาณการ Base เดือนนี้
alter table public.sales_meeting_people add column next_adj numeric(16,2) not null default 0;

create or replace function public.import_sales_meeting(p_file_name text, p_meeting jsonb, p_people jsonb, p_products jsonb, p_pipeline jsonb)
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

  insert into public.sales_meeting_people (meeting_id, salesperson, sort, target, weeks, next_adj)
  select v_id, x.salesperson, x.sort, coalesce(x.target, 0),
         coalesce(array(select coalesce((w)::numeric, 0) from jsonb_array_elements_text(x.weeks) w), '{}'), coalesce(x.next_adj, 0)
  from jsonb_to_recordset(p_people) as x(salesperson text, sort integer, target numeric, weeks jsonb, next_adj numeric);
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
