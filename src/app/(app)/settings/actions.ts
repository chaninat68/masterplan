"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

/** เปลี่ยนบทบาท / เปิด-ปิดผู้ใช้ — admin เท่านั้น (RLS profiles_update_admin บังคับซ้ำ) */
export async function updateUser(id: string, field: "role" | "active" | "full_name", value: string): Promise<Result> {
  try {
    const me = await requireRole(["admin"]);
    const uid = z.uuid().parse(id);
    const supabase = await createClient();
    let patch: { role?: "admin" | "planning" | "manager" | "accounting" | "drive_team"; active?: boolean; full_name?: string };
    if (field === "role") patch = { role: z.enum(["admin", "planning", "manager", "accounting", "drive_team"]).parse(value) };
    else if (field === "active") patch = { active: value === "true" };
    else patch = { full_name: z.string().trim().max(100).parse(value) };
    // กันแอดมินลดสิทธิ์/ปิดตัวเองจนไม่มีแอดมินเหลือ
    if (uid === me.id && (patch.role && patch.role !== "admin" || patch.active === false)) {
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true);
      if ((count ?? 0) <= 1) throw new Error("ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน");
    }
    const { error } = await supabase.from("profiles").update(patch).eq("id", uid);
    if (error) throw new Error(error.message);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
}
