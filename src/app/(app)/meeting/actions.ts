"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EDITORS, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<void>): Promise<Result> {
  try {
    await requireRole(EDITORS);
    await fn();
    revalidatePath("/meeting");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
    return { ok: false, error: msg };
  }
}

const Category = z.enum(["", "base", "best", "lost", "excluded", "cancelled"]);
const Month = z.string().regex(/^\d{4}-\d{2}-01$/, "เดือนไม่ถูกต้อง").or(z.literal("")).transform((v) => v || null);
// มูลค่ากรอกเป็นล้านบาท (เหมือนในที่ประชุม) → เก็บเป็นบาท
const Million = z.coerce.number().min(0, "มูลค่าต้องไม่ติดลบ").max(100000).transform((v) => Math.round(v * 1e6 * 100) / 100);

// ฟิลด์ที่แก้ในเว็บได้
const FIELDS = {
  category: Category,
  expected_month: Month,
  status_note: z.string().trim().max(500),
  value: Million,
  customer: z.string().trim().max(300),
  project: z.string().trim().max(300),
} as const;
export type PipelineField = keyof typeof FIELDS;

export async function updatePipeline(id: number, field: PipelineField, value: string): Promise<Result> {
  return run(async () => {
    const schema = FIELDS[field];
    if (!schema) throw new Error("แก้ฟิลด์นี้ไม่ได้");
    const v = schema.parse(value);
    const user = await requireRole(EDITORS);
    const supabase = await createClient();
    const { error } = await supabase.from("sales_pipeline")
      .update({ [field]: v, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", z.number().int().parse(id));
    if (error) throw new Error(error.message);
  });
}

const NewItem = z.object({
  meeting_id: z.uuid(),
  salesperson: z.string().trim().min(1, "เลือกเซลล์").max(100),
  product: z.string().trim().max(20),
  customer: z.string().trim().max(300),
  project: z.string().trim().min(1, "กรอกชื่อโครงการ").max(300),
  value: Million,
  category: Category,
  expected_month: Month,
  status_note: z.string().trim().max(500),
});

export async function addPipeline(input: Record<string, string>): Promise<Result> {
  return run(async () => {
    const v = NewItem.parse(input);
    const user = await requireRole(EDITORS);
    const supabase = await createClient();
    const { error } = await supabase.from("sales_pipeline").insert({ ...v, row_no: 0, updated_by: user.id });
    if (error) throw new Error(error.message);
  });
}

export async function deletePipeline(id: number): Promise<Result> {
  return run(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("sales_pipeline").delete().eq("id", z.number().int().parse(id));
    if (error) throw new Error(error.message);
  });
}
