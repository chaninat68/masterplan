"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EDITORS, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Code = z.string().regex(/^[A-Z]\d{2}-[A-Z]\d{3,4}$/, "รหัสโครงการไม่ถูกต้อง");
const DateIso = z.iso.date("วันที่ไม่ถูกต้อง");
const Qty = z.coerce.number().min(0, "จำนวนต้องไม่ติดลบ").max(100000);

async function run(fn: () => Promise<void>, paths: string[]): Promise<ActionResult> {
  try {
    await requireRole(EDITORS);
    await fn();
    paths.forEach((p) => revalidatePath(p));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
    return { ok: false, error: msg };
  }
}

// ฟิลด์โครงการที่แก้ในเว็บได้
const FIELDS = {
  customer_name: z.string().trim().max(300),
  project_name: z.string().trim().max(300),
  pm: z.string().trim().max(100),
  sales: z.string().trim().max(100),
  billing_cycle: z.string().trim().max(300),
  note: z.string().trim().max(2000),
  status: z.enum(["ongoing", "on_hand", "hold", "completed", "cancelled"]),
  start_date: DateIso.or(z.literal("")).transform((v) => v || null),
  end_date: DateIso.or(z.literal("")).transform((v) => v || null),
  order_qty: Qty,
  contract_value: z.coerce.number().min(0),
  value_per_pile: z.coerce.number().min(0),
} as const;
export type ProjectField = keyof typeof FIELDS;

export async function updateProject(code: string, field: ProjectField, value: string): Promise<ActionResult> {
  return run(async () => {
    const c = Code.parse(code);
    const schema = FIELDS[field];
    if (!schema) throw new Error("แก้ฟิลด์นี้ไม่ได้");
    const v = schema.parse(value);
    const supabase = await createClient();
    const { error } = await supabase.from("projects").update({ [field]: v }).eq("code", c);
    if (error) throw new Error(error.message);
  }, [`/projects/${code}`, "/projects"]);
}

/** แผนรายวัน: 0 หรือว่าง = ลบแผนวันนั้น */
export async function setPlanDay(code: string, date: string, value: string): Promise<ActionResult> {
  return run(async () => {
    const c = Code.parse(code), d = DateIso.parse(date), q = Qty.parse(value || 0);
    const supabase = await createClient();
    const res = q > 0
      ? await supabase.from("project_plan_days").upsert({ project_code: c, plan_date: d, planned_qty: q }, { onConflict: "project_code,plan_date" })
      : await supabase.from("project_plan_days").delete().eq("project_code", c).eq("plan_date", d);
    if (res.error) throw new Error(res.error.message);
  }, [`/projects/${code}`]);
}

/** หมายเหตุรายวัน: code ว่าง = ทั้งบริษัท, ข้อความว่าง = ลบ */
export async function setNote(code: string | null, date: string, body: string): Promise<ActionResult> {
  return run(async () => {
    const c = code ? Code.parse(code) : null, d = DateIso.parse(date);
    const b = z.string().trim().max(500).parse(body);
    const supabase = await createClient();
    let q = supabase.from("daily_notes").delete().eq("note_date", d);
    q = c ? q.eq("project_code", c) : q.is("project_code", null);
    const del = await q;
    if (del.error) throw new Error(del.error.message);
    if (b) {
      const { error } = await supabase.from("daily_notes").insert({ project_code: c, note_date: d, body: b, source: "manual" });
      if (error) throw new Error(error.message);
    }
  }, code ? [`/projects/${code}`, "/daily"] : ["/daily"]);
}

const ManualLog = z.object({
  code: Code, date: DateIso, rig: z.string().trim().min(1, "ระบุชื่อปั้นจั่น").max(100),
  size: z.string().trim().max(40), length: z.coerce.number().min(0).max(100),
  shift: z.enum(["A", "B"]), qty: z.coerce.number().positive("จำนวนต้นต้องมากกว่า 0").max(10000),
});

/** บันทึกยอดตอกเอง (กรณีทีมส่งยอดทาง LINE ไม่มีไฟล์) */
export async function addManualLog(input: z.input<typeof ManualLog>): Promise<ActionResult> {
  return run(async () => {
    const x = ManualLog.parse(input);
    const supabase = await createClient();
    const { data: last } = await supabase.from("drive_logs").select("rig_type, company_raw, company_id, leader")
      .eq("rig_name", x.rig).order("work_date", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("drive_logs").insert({
      work_date: x.date, project_code: x.code, rig_name: x.rig, size_code: x.size, length_m: x.length, shift: x.shift, qty: x.qty,
      rig_type: last?.rig_type ?? "", company_raw: last?.company_raw ?? "", company_id: last?.company_id ?? null, leader: last?.leader ?? "",
      source: "manual", dedupe_key: `manual|${crypto.randomUUID()}`,
    });
    if (error) throw new Error(error.message);
  }, [`/projects/${input.code}`]);
}

export async function deleteManualLog(code: string, id: number): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("drive_logs").delete().eq("id", z.number().int().parse(id)).eq("source", "manual");
    if (error) throw new Error(error.message);
  }, [`/projects/${code}`]);
}

/** ค่าตั้งระบบ (เช่น N สัปดาห์เตือนเร่งขาย) */
export async function setSetting(key: "runway_weeks" | "rate_window_days", value: string): Promise<ActionResult> {
  return run(async () => {
    const v = z.coerce.number().int().min(1).max(key === "runway_weeks" ? 52 : 120).parse(value);
    const supabase = await createClient();
    const { error } = await supabase.from("settings").update({ value: v }).eq("key", key);
    if (error) throw new Error(error.message);
  }, ["/sales", "/settings", "/overview"]);
}
