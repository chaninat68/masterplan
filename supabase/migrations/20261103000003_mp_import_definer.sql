-- หลังกันคอลัมน์มูลค่าใน projects (20261103000002): upsert แบบ ON CONFLICT DO UPDATE ต้องมีสิทธิ์ SELECT
-- ทุกคอลัมน์ที่อัปเดต → ให้ import_master_planning ทำงานด้วยสิทธิ์เจ้าของฟังก์ชัน
-- ปลอดภัย: ฟังก์ชันตรวจ public.can_edit() เป็นคำสั่งแรก (admin/planning เท่านั้น) และ EXECUTE ให้เฉพาะ authenticated
alter function public.import_master_planning(text, jsonb, jsonb, jsonb, jsonb, date, date, boolean) security definer;
