import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PAGES, ROLE_CONFIG, type PageKey, type Role } from "@/lib/roles";

export type CurrentUser = { id: string; email: string; name: string; role: Role; canEdit: boolean };

// อ่านผู้ใช้ + role จาก profiles (ไม่ใช้ user_metadata) — cache ต่อ request
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const { data: p } = await supabase.from("profiles").select("email, full_name, role, active").eq("id", uid).maybeSingle();
  if (!p || !p.active) return null;
  const role = p.role as Role;
  return { id: uid, email: p.email, name: p.full_name || p.email, role, canEdit: ROLE_CONFIG[role].canEdit };
});

// ใช้ใน Server Component: ไม่มีสิทธิ์หน้านี้ → ไปหน้าแรกของบทบาท
export async function requirePage(page: PageKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLE_CONFIG[user.role].pages.includes(page)) redirect(PAGES[ROLE_CONFIG[user.role].home].href);
  return user;
}

// ใช้ใน Server Action: เช็กซ้ำทุกครั้ง (RLS เป็นชั้นสุดท้าย)
export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) throw new Error("ไม่มีสิทธิ์ทำรายการนี้");
  return user;
}

export const EDITORS: Role[] = ["admin", "planning"];
