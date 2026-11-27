-- กลุ่มสาเหตุที่ไม่ได้งาน (ผู้ใช้สั่ง 27 พ.ย. 2569): ราคาสูง / ต้องการสินค้าเร่งด่วน / ลูกค้าชะลอโครงการ / ลูกค้าไม่ได้งาน
-- ค่าว่าง = จัดกลุ่มอัตโนมัติจากข้อความสถานะ (lostReason() ใน src/lib/salesMeeting.ts) · เลือกเองในเว็บได้
alter table public.sales_pipeline
  add column lost_reason text not null default ''
  check (lost_reason in ('', 'price', 'urgent', 'delayed', 'customer_lost'));
