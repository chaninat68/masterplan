// ROLE_CONFIG — ที่เดียวที่กำหนดว่าบทบาทไหนเห็นหน้าไหน หน้าแรกคืออะไร แก้ไขได้ไหม
// ใช้ทั้งเมนูและการกันหน้า (สิทธิ์ข้อมูลจริงบังคับด้วย RLS ใน Supabase)

export type Role = "admin" | "planning" | "manager" | "accounting" | "drive_team";
export type PageKey = "overview" | "projects" | "daily" | "import" | "finance" | "sales" | "drive" | "settings";

export const PAGES: Record<PageKey, { label: string; href: string; icon: string }> = {
  overview: { label: "ภาพรวม", href: "/overview", icon: "home" },
  projects: { label: "แผน / ผลงาน", href: "/projects", icon: "plan" },
  daily: { label: "รายงานประจำวัน", href: "/daily", icon: "day" },
  import: { label: "นำเข้าไฟล์", href: "/import", icon: "up" },
  finance: { label: "การเงิน / วางบิล", href: "/finance", icon: "money" },
  sales: { label: "ยอดขาย & Runway", href: "/sales", icon: "trend" },
  drive: { label: "ฝ่ายตอก", href: "/drive", icon: "crane" },
  settings: { label: "ตั้งค่า", href: "/settings", icon: "gear" },
};

export const ROLE_CONFIG: Record<Role, { label: string; pages: PageKey[]; home: PageKey; canEdit: boolean }> = {
  admin: { label: "ผู้ดูแลระบบ", pages: ["overview", "projects", "daily", "import", "finance", "sales", "drive", "settings"], home: "overview", canEdit: true },
  planning: { label: "ฝ่าย Planning", pages: ["overview", "projects", "daily", "import", "finance", "sales", "drive", "settings"], home: "projects", canEdit: true },
  manager: { label: "ผู้จัดการ", pages: ["overview", "projects", "daily", "finance", "sales", "drive"], home: "overview", canEdit: false },
  accounting: { label: "ฝ่ายบัญชี", pages: ["finance", "projects", "daily", "sales"], home: "finance", canEdit: false },
  drive_team: { label: "ฝ่ายตอก", pages: ["drive", "daily", "projects"], home: "drive", canEdit: false },
};

export const canSeeSales = (r: Role) => r !== "drive_team";
