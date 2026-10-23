# แผนงาน (Tasks) — Master Planning Dashboard

ทำตามลำดับ Phase แต่ละ task ควรเสร็จได้ใน ≤ 1 วันและเห็นผลจริง ติ๊ก [x] เมื่อผ่าน "ตรวจ" แล้ว commit
MVP = Phase 0–6 · ใช้คู่ขนานกับ Excel ใน Phase 7

---

## Phase −1 — พรีวิวดีไซน์
- [x] **TP.1** พรีวิว HTML ไฟล์เดียวด้วยข้อมูลจริง ครบทุกโมดูล + สลับบทบาท (`preview/build-preview.ps1` → `preview/master-planning-preview.html`)
- [ ] **TP.2** ผู้ใช้ทดลองและให้ feedback ดีไซน์/ระบบ ก่อนเริ่ม Phase 0

## Phase 0 — Setup
- [ ] **T0.1** ติดตั้ง Node.js LTS, Git, Supabase CLI (ตอนนี้เครื่องยังไม่มี Node.js) — ตรวจ: `node -v`, `git --version`, `supabase --version`
- [ ] **T0.2** git init + `.gitignore` (`*.xlsx`, `.env*`, `node_modules`, `reference/`) + repo GitHub แบบ Private — ตรวจ: `git status` ไม่เห็นไฟล์ xlsx
- [ ] **T0.3** สร้าง Next.js (TS, App Router, Tailwind, ESLint, `src/`) + shadcn/ui + ฟอนต์ Prompt + ธีมสว่าง/มืด — ตรวจ: `npm run build` ผ่าน
- [ ] **T0.4** สร้าง Supabase project `master-planning-dev` (Singapore) + `supabase init/link` — ตรวจ: เชื่อมต่อได้
- [ ] **T0.5** copy ไฟล์ Excel ทั้ง 3 ไฟล์ไว้ใน `reference/` (ไม่ขึ้น git)

## Phase 1 — ฐานข้อมูลและข้อมูลตั้งต้น
- [ ] **T1.1** ยืนยัน `docs/DATA-MODEL.md` + ถามคำถามเปิด Q1–Q7 ใน PRD
- [ ] **T1.2** Migration: ตารางทั้งหมด, enum, constraint, index — ตรวจ: `supabase db push` ผ่าน
- [ ] **T1.3** Migration: `my_role()`, trigger สร้าง profile, RLS ทุกตาราง + test RLS (`supabase/tests/`) — ตรวจ: role ดูอย่างเดียว insert/update ไม่ได้
- [ ] **T1.4** Migration: view ทั้งหมด (`v_project_progress`, `v_backlog`, …) — ตรวจ: query ได้
- [ ] **T1.5** Seed master data: `pile_sizes` (แท็บ ขนาด), `rigs`, `companies` + `company_aliases`
- [ ] **T1.6** Seed Master Planning: Pile → `projects` + `project_plan_days` (wide→long, ข้าม `x`/ข้อความ, แปลงสถานะ, billing_cycle จากคอลัมน์ E แถว Actual) + `project_actual_legacy` — ตรวจ: AC1, AC2
- [ ] **T1.7** Seed คิว-วัน → `drive_logs` (trim, alias, dedupe) — ตรวจ: AC3, รันซ้ำแถวไม่เพิ่ม
- [ ] **T1.8** Seed SO `dataรวม` → `customers` + `sales_docs` (normalize กลุ่มลูกค้า, `#N/A` → null) — ตรวจ: AC4
- [ ] **T1.8b** view `v_project_so_net` (จำนวน/มูลค่าสุทธิ P+R+C ต่อโครงการ ไม่นับบริการ) → ใช้ตรวจเทียบกับ Master Planning (ตัวจริง) และเป็นยอดสั่งซื้อเฉพาะโครงการที่ไม่มีใน Master Planning — ตรวจ: AC11 (30/34 ตรง, 3 โครงการ A69 ขึ้นเตือน)
- [ ] **T1.9** รายงานรหัสโครงการที่ไม่เจอคู่ระหว่าง 3 ไฟล์ — ส่งให้ Planning ตรวจ (ไม่ต้องเทียบ Actual Pile vs คิว-วัน: คิว-วันคือตัวจริง)

## Phase 2 — Login และโครงหน้า
- [ ] **T2.1** Supabase Auth (`@supabase/ssr`), หน้า /login ภาษาไทย, ปิดสมัครเอง
- [ ] **T2.2** `getCurrentUser()`, `requireRole()`, `ROLE_CONFIG` (เมนู + หน้าแรก + กันหน้า) — ตรวจ: เข้าหน้าที่ไม่มีสิทธิ์ถูกพาออก
- [ ] **T2.3** AppShell: sidebar ตามบทบาท, topbar (วันที่ข้อมูลล่าสุด พ.ศ., ป้ายดูอย่างเดียว), มือถือ
- [ ] **T2.4** `lib/format.ts` (วันที่ พ.ศ., ต้น, บาท/ล้าน) + unit test

## Phase 3 — M1 Planning (สำคัญที่สุด)
- [ ] **T3.1** /projects รายการโครงการ + ตัวกรองสถานะ/PM/Sales + เรียงคอลัมน์
- [ ] **T3.2** /projects/[code] รายละเอียด + KPI + S-curve + ประวัติรายวัน
- [ ] **T3.3** ฟอร์มเพิ่ม/แก้โครงการ (zod + Server Action) + สร้างจาก SO
- [ ] **T3.4** Plan grid: แก้แผนรายวันช่วงวันที่, วางจาก Excel, ตัวช่วยกระจายแผน — ตรวจ: Ahead/Behind เปลี่ยนทันที
- [ ] **T3.5** บันทึก Actual รายวัน (หลายแถวต่อครั้ง, เลือกปั้นจั่น/ขนาด/ความยาว/กะ, คำนวณคิว/เมตร)
- [ ] **T3.5b** หมายเหตุรายวัน (รายโครงการ + ทั้งบริษัท) พร้อมปุ่มเหตุผลด่วน (ฝนตก, น้ำท่วม, รอพื้นที่ …) — แถวที่มีแผนแต่ไม่มีผลงานและไม่มีหมายเหตุ ไฮไลต์แดง
- [ ] **T3.5c** ตารางโครงการขยายรายวัน (ปั้นจั่น · ขนาด · ยาว · กะ · ต้น) + คลิกแก้ไขทุกช่อง
- [ ] **T3.6** /import: อัปโหลด xlsx (คิว-วัน, Master Planning) → preview ใหม่/ซ้ำ/ผิด → ยืนยัน (RPC transaction) → ประวัติ + ย้อนกลับ — ตรวจ: AC5
- [ ] **T3.7** Export Master Planning รูปแบบเดิม + Export คิว-วัน — ตรวจ: AC6

## Phase 4 — M2 Manager + M4 ภาพรวม/Sales Alert
- [ ] **T4.1** /overview KPI (เมื่อวาน/สัปดาห์/เดือน/ปี), โครงการช้าสุด, กราฟรายวัน/สัปดาห์/เดือน (เอเซีย vs ร่วม)
- [ ] **T4.2** ผลงานตามบริษัท/หัวหน้าสาย/ประเภทโครงการ + ปุ่มคัดลอกสรุป LINE
- [ ] **T4.3** Backlog + Runway (สีตาม N) + กราฟพยากรณ์งานหมด — ตรวจ: AC9
- [ ] **T4.4** Pipeline SO รออนุมัติ, On Hand ยังไม่เริ่ม, ยอดขายต่อเซลล์, ลูกค้าใหม่/เก่า

## Phase 5 — M3 บัญชี
- [ ] **T5.1** /finance มูลค่าผลงานต่อโครงการ + งวดนี้ตามรอบวางบิล + รายการถึงรอบวางบิล
- [ ] **T5.2** ยอดขายสุทธิรายเดือน (P − R − C) แยกเซลล์/กลุ่มลูกค้า
- [ ] **T5.3** Export xlsx + คัดลอกไป Excel

## Phase 6 — M6 ฝ่ายตอก + Admin (ส่วนผู้ผลิตตัดออกจากขอบเขต 23 ต.ค. 69)
- [ ] **T6.2** /drive คิวปั้นจั่น 7 วัน + ปั้นจั่นว่าง
- [ ] **T6.3** Export Excel + ข้อความ LINE ของทั้งสองหน้า
- [ ] **T6.4** /admin ผู้ใช้/บทบาท (เชิญอีเมล), master data, ตั้งค่า N สัปดาห์

## Phase 7 — ทดสอบ, Deploy, ใช้คู่ขนาน
- [ ] **T7.1** Unit test: format, อ่านวันที่ พ.ศ./Excel serial, จับคู่หัวคอลัมน์, dedupe_key, สูตร Ahead/Behind/Runway
- [ ] **T7.2** E2E Playwright ต่อบทบาท (planning import+undo, manager ดูอย่างเดียว, accounting export, drive_team ดูคิวปั้นจั่น) — ตรวจ: AC7, AC10
- [ ] **T7.3** Security: ทุก Server Action มี requireRole, ไม่มี secret ใน bundle, Supabase Security Advisor ผ่าน
- [ ] **T7.4** Supabase prod + Vercel deploy + Auth URL + bucket `imports`
- [ ] **T7.5** README + คู่มือสั้นแต่ละบทบาท
- [ ] **T7.6** ใช้คู่ขนานกับ Excel 2–4 สัปดาห์ เทียบตัวเลขทุกสัปดาห์ แล้วเลิกแก้ Excel

## ทีหลัง (หลัง MVP)
- [ ] ล็อกงวดบัญชี + ติดตามวางบิล/รับเงิน
- [ ] ประวัติการแก้ไข (audit log)
- [ ] หัวหน้าสายกรอก Actual จากมือถือ
- [ ] แจ้งเตือน LINE (Runway แดง, โครงการช้า), รายงานสัปดาห์ PDF
- [ ] เป้ายอดขายต่อเซลล์, ค่าวัสดุสิ้นเปลือง
