"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EDITORS, requireRole } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { readSheets } from "@/lib/import/excel";
import { parseProjectPlan, type PlanDay } from "@/lib/import/projectPlan";

const Code = z.string().regex(/^[A-Z]\d{2}-[A-Z]\d{3,4}$/, "รหัสโครงการไม่ถูกต้อง");
const MAX = 10 * 1024 * 1024;

export type PlanPreview =
  | {
      ok: true; fileName: string; from: string; to: string; days: PlanDay[]; rows: string[]; warnings: string[];
      fileTotal: number; keepBefore: number; replaced: number; orderQty: number;
    }
  | { ok: false; error: string };

async function readFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("กรุณาเลือกไฟล์");
  if (file.size > MAX) throw new Error("ไฟล์ใหญ่เกิน 10MB");
  if (!/\.xls[xm]?$/i.test(file.name)) throw new Error("รองรับเฉพาะไฟล์ Excel (.xlsx)");
  const r = parseProjectPlan(readSheets(await file.arrayBuffer()));
  if (!r.days.some((d) => d.qty > 0)) throw new Error(r.warnings[0] ?? "ไม่พบแผนรายวันในไฟล์");
  return { name: file.name, ...r };
}

/** ตรวจไฟล์แผนงาน: แผนในไฟล์จะแทนที่แผนเดิมตั้งแต่วันแรกในไฟล์เป็นต้นไป */
export async function previewPlanFile(code: string, formData: FormData): Promise<PlanPreview> {
  try {
    await requireRole(EDITORS);
    const c = Code.parse(code);
    const r = await readFile(formData);
    const from = r.days[0].date, to = r.days[r.days.length - 1].date;
    const supabase = await createClient();
    const [plan, proj] = await Promise.all([
      fetchAll<{ plan_date: string; planned_qty: number }>((s, e) => supabase.from("project_plan_days").select("plan_date, planned_qty").eq("project_code", c).order("plan_date").range(s, e)),
      supabase.from("projects").select("order_qty").eq("code", c).single(),
    ]);
    if (proj.error) throw new Error("ไม่พบโครงการ");
    const sumOf = (f: (d: string) => boolean) => plan.filter((p) => f(p.plan_date)).reduce((s, p) => s + Number(p.planned_qty), 0);
    return {
      ok: true, fileName: r.name, from, to, days: r.days.filter((d) => d.qty > 0), rows: r.rows, warnings: r.warnings,
      fileTotal: r.total, keepBefore: sumOf((d) => d < from), replaced: sumOf((d) => d >= from), orderQty: Number(proj.data.order_qty),
    };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ" };
  }
}

export async function importPlanFile(code: string, formData: FormData): Promise<{ ok: true; batchId: string; message: string } | { ok: false; error: string }> {
  try {
    await requireRole(EDITORS);
    const c = Code.parse(code);
    const r = await readFile(formData);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_project_plan", { p_code: c, p_file_name: r.name, p_days: r.days });
    if (error) throw new Error(error.message);
    const res = data as { batch_id: string; added: number; replaced: number };
    revalidatePath(`/projects/${c}`);
    revalidatePath("/", "layout");
    return { ok: true, batchId: res.batch_id, message: `อัปเดตแผนแล้ว ${res.added} วัน (แทนที่แผนเดิม ${res.replaced} วัน)` };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
}
