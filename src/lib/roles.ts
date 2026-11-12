// ROLE_CONFIG — ที่เดียวที่กำหนดว่าบทบาทไหนเห็นหน้าไหน หน้าแรกคืออะไร แก้ไขได้ไหม
// ใช้ทั้งเมนูและการกันหน้า (สิทธิ์ข้อมูลจริงบังคับด้วย RLS ใน Supabase)

export type Role = "admin" | "planning" | "manager" | "accounting" | "drive_team" | "production";
export const ROLES: Role[] = ["admin", "planning", "manager", "accounting", "drive_team", "production"];
export type PageKey = "overview" | "projects" | "timeline" | "daily" | "import" | "finance" | "pnl" | "sales" | "meeting" | "monthly" | "drive" | "settings";

export const PAGES: Record<PageKey, { label: string; href: string; icon: string }> = {
  overview: { label: "ภาพรวม", href: "/overview", icon: "home" },
  projects: { label: "แผน / ผลงาน", href: "/projects", icon: "plan" },
  timeline: { label: "Project Timeline", href: "/timeline", icon: "gantt" },
  daily: { label: "รายงานประจำวัน", href: "/daily", icon: "day" },
  import: { label: "นำเข้าไฟล์", href: "/import", icon: "up" },
  finance: { label: "มูลค่ายอดขาย / มูลค่างานคงเหลือ", href: "/finance", icon: "money" },
  pnl: { label: "Profit and Loss", href: "/pnl", icon: "pie" },
  sales: { label: "ยอดขาย & Runway", href: "/sales", icon: "trend" },
  meeting: { label: "ประชุมแผนกขาย", href: "/meeting", icon: "users" },
  monthly: { label: "ประชุมประจำเดือน (วางแผน)", href: "/monthly", icon: "present" },
  drive: { label: "ฝ่ายตอก", href: "/drive", icon: "crane" },
  settings: { label: "ตั้งค่า", href: "/settings", icon: "gear" },
};

// ประชุมประจำเดือน (monthly) = เฉพาะส่วนงานวางแผน/ผู้ดูแล (ผู้ใช้สั่ง 3 พ.ย. 2569) — RLS planning_meetings ใช้ can_edit()
// ตามตารางสิทธิ์ของผู้ใช้ (3 พ.ย. 2569): วางแผนแก้ไขได้ทุกหน้า, ฝ่ายอื่นดูได้ (หน้านำเข้าไฟล์ = ดูประวัติอย่างเดียว),
// ตั้งค่าเฉพาะวางแผน/ผู้ดูแล, ฝ่ายตอก/ฝ่ายผลิตห้ามเห็นตัวเลขมูลค่าเงินทุกหน้า (ไม่มีหน้าการเงิน)
const VIEW_ALL: PageKey[] = ["overview", "projects", "timeline", "daily", "import", "finance", "pnl", "sales", "meeting", "drive"];
const VIEW_NO_MONEY: PageKey[] = ["overview", "projects", "timeline", "daily", "import", "sales", "drive"];

export const ROLE_CONFIG: Record<Role, { label: string; pages: PageKey[]; home: PageKey; canEdit: boolean }> = {
  admin: { label: "ผู้ดูแลระบบ", pages: [...VIEW_ALL, "monthly", "settings"], home: "overview", canEdit: true },
  planning: { label: "ส่วนงานวางแผน", pages: [...VIEW_ALL, "monthly", "settings"], home: "projects", canEdit: true },
  manager: { label: "ผู้บริหาร", pages: VIEW_ALL, home: "overview", canEdit: false },
  accounting: { label: "ฝ่ายบัญชี", pages: VIEW_ALL, home: "finance", canEdit: false },
  drive_team: { label: "ฝ่ายตอก", pages: VIEW_NO_MONEY, home: "drive", canEdit: false },
  production: { label: "ฝ่ายผลิต", pages: VIEW_NO_MONEY, home: "projects", canEdit: false },
};

/** เห็นตัวเลขมูลค่าเงิน / ข้อมูลขาย (ตรงกับ public.can_see_sales() ในฐานข้อมูล) */
export const canSeeSales = (r: Role) => r === "admin" || r === "planning" || r === "manager" || r === "accounting";
