"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EDITORS, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DeliverySchema, IssuesSchema, StatusSchema } from "@/lib/planningMeeting";

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: (userId: string) => Promise<void>): Promise<Result> {
  try {
    const user = await requireRole(EDITORS);
    await fn(user.id);
    revalidatePath("/monthly");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
    return { ok: false, error: msg };
  }
}

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง");

/** สร้างครั้งประชุมใหม่ — คัดลอกรายการโครงการมีปัญหาจากครั้งล่าสุดมาให้แก้ต่อ */
export async function createMeeting(input: { meeting_date: string; status_asof: string }): Promise<Result> {
  return run(async (uid) => {
    const v = z.object({ meeting_date: IsoDate, status_asof: IsoDate }).parse(input);
    const supabase = await createClient();
    const { data: last } = await supabase.from("planning_meetings").select("issues, delivery").lt("meeting_date", v.meeting_date)
      .order("meeting_date", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("planning_meetings").insert({
      ...v, issues: last?.issues ?? [], created_by: uid, updated_by: uid,
    });
    if (error) throw new Error(error.code === "23505" ? "มีประชุมวันที่นี้แล้ว" : error.message);
  });
}

const SECTIONS = {
  status_counts: StatusSchema,
  status_values: StatusSchema,
  issues: IssuesSchema,
  delivery: DeliverySchema,
  meta: z.object({ title: z.string().trim().min(1, "กรอกหัวเรื่อง").max(100), status_asof: IsoDate, notes: z.string().trim().max(5000) }),
} as const;
export type Section = keyof typeof SECTIONS;

export async function saveSection(id: string, section: Section, data: unknown): Promise<Result> {
  return run(async (uid) => {
    const schema = SECTIONS[section];
    if (!schema) throw new Error("หัวข้อไม่ถูกต้อง");
    const parsed = schema.parse(data);
    const patch = section === "meta" ? parsed : { [section]: parsed };
    const supabase = await createClient();
    const { error } = await supabase.from("planning_meetings")
      .update({ ...patch, updated_by: uid, updated_at: new Date().toISOString() }).eq("id", z.uuid().parse(id));
    if (error) throw new Error(error.message);
  });
}

export async function deleteMeeting(id: string): Promise<Result> {
  return run(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("planning_meetings").delete().eq("id", z.uuid().parse(id));
    if (error) throw new Error(error.message);
  });
}

/** นำเข้าตารางสถานะโครงการ (จำนวน + มูลค่า) จากไฟล์ Excel → บันทึกทั้ง 2 สไลด์ */
export async function importStatusFile(id: string, form: FormData): Promise<Result & { labels?: { cur: string; prev: string } }> {
  let labels: { cur: string; prev: string } | undefined;
  const r = await run(async (uid) => {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("เลือกไฟล์ Excel");
    if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 10 MB");
    const { readSheets } = await import("@/lib/import/excel");
    const { parsePlanningStatus } = await import("@/lib/import/planningStatus");
    const p = parsePlanningStatus(readSheets(await file.arrayBuffer()));
    labels = p.labels;
    const supabase = await createClient();
    const { error } = await supabase.from("planning_meetings")
      .update({ status_counts: StatusSchema.parse(p.counts), status_values: StatusSchema.parse(p.values), updated_by: uid, updated_at: new Date().toISOString() })
      .eq("id", z.uuid().parse(id));
    if (error) throw new Error(error.message);
  });
  return r.ok ? { ...r, labels } : r;
}
