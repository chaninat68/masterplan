-- Profit and Loss รายโครงการ (ผู้ใช้สั่ง 12 พ.ย. 2569) — ค่า enum ต้องแยก migration ก่อนใช้งาน
alter type public.import_kind add value if not exists 'pnl';
