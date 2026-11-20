-- ประชุมเตรียมงาน (ไฟล์ทำแผน.xlsx, ผู้ใช้สั่ง 19 พ.ย. 2569) — ค่า enum ต้องแยก migration ก่อนใช้งาน
alter type public.import_kind add value if not exists 'prep';
