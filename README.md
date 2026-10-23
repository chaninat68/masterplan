# MasterPlan — Master Planning Dashboard

เว็บแอปแผนและผลงานตอกเสาเข็ม (Next.js 16 + Supabase) แทนการอัพเดท Excel 3 ไฟล์ด้วยมือ
รายละเอียดความต้องการ: `docs/PRD.md` · ฐานข้อมูล: `docs/DATA-MODEL.md` · แผนงาน: `docs/TASKS.md`

## ติดตั้งบนเครื่องใหม่
1. ติดตั้ง Node.js 24 LTS
2. `npm install`
3. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่าจาก Supabase → Project Settings → API Keys
4. `npm run dev` แล้วเปิด http://localhost:3000

## คำสั่ง
| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | รันเครื่องตัวเองแบบพัฒนา |
| `npm run build` / `npm start` | build และรันแบบ production |
| `npm run lint` / `npm run typecheck` | ตรวจโค้ด |
| `npm test` | unit test (Vitest) — รวมทดสอบ parser กับไฟล์จริงถ้ามีในเครื่อง |
| `npm run e2e` | ทดสอบทั้งระบบ (Playwright + Microsoft Edge) ต้องมี `E2E_EMAIL`/`E2E_PASSWORD` ใน `.env.local` |

## ฐานข้อมูล
- migration อยู่ใน `supabase/migrations/` (รันแล้วกับโปรเจค `mdmwtopazxplypppodyv`) — เปลี่ยน schema ด้วย migration ใหม่เท่านั้น
- ข้อมูลตั้งต้น: ล็อกอินเป็น admin/planning → หน้า **นำเข้าไฟล์** → Master Planning → คิว-วัน → SO

## ผู้ใช้
- เพิ่มผู้ใช้ใน Supabase Dashboard → Authentication → Users → Add user (ติ๊ก Auto Confirm)
- ผู้ใช้ใหม่ได้บทบาท `drive_team` (ดูอย่างเดียว) — admin เปลี่ยนบทบาทได้ที่หน้า **ตั้งค่า**
- บัญชี admin คนแรก: ตั้งบทบาทด้วย SQL `update public.profiles set role = 'admin' where email = '...';`
