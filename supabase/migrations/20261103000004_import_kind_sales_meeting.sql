-- ไฟล์ "Sales Update dd-mm-yy.xlsx" (ประชุมแผนกขายประจำสัปดาห์) — แยกไฟล์: ค่า enum ใหม่ใช้ใน transaction เดียวกันไม่ได้
alter type public.import_kind add value if not exists 'sales_meeting';
