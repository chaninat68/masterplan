-- บทบาทฝ่ายผลิต (ดูอย่างเดียว ไม่เห็นมูลค่าเงิน) — ผู้ใช้สั่งเพิ่มกลับ 3 พ.ย. 2569
-- แยกไฟล์: ค่า enum ใหม่ใช้ใน transaction เดียวกับที่เพิ่มไม่ได้
alter type public.app_role add value if not exists 'production';
