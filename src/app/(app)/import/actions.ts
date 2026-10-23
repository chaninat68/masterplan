"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EDITORS, requireRole } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { readSheets } from "@/lib/import/excel";
import { parseQueue } from "@/lib/import/queue";
import { parseMasterPlanning } from "@/lib/import/masterPlanning";
import { parseSales } from "@/lib/import/sales";

export type Kind = "queue" | "master_planning" | "sales";
export type Preview = {
  ok: true; kind: Kind; fileName: string;
  stats: { label: string; value: number; tone?: "new" | "dup" | "err" | "warn" }[];
  sample: Record<string, string | number>[];
  errors: string[];
  note?: string;
} | { ok: false; error: string };
export type CommitResult = { ok: true; message: string } | { ok: false; error: string };

const KindSchema = z.enum(["queue", "master_planning", "sales"]);
const MAX = 40 * 1024 * 1024;

async function readFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("กรุณาเลือกไฟล์");
  if (file.size > MAX) throw new Error("ไฟล์ใหญ่เกิน 40MB");
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) throw new Error("รองรับเฉพาะไฟล์ Excel (.xlsx)");
  return { name: file.name, buf: await file.arrayBuffer() };
}

async function legacyCutoff() {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "legacy_actual_cutoff").maybeSingle();
  return (data?.value as string) ?? "2026-01-01";
}

export async function previewImport(kindRaw: string, formData: FormData): Promise<Preview> {
  try {
    await requireRole(EDITORS);
    const kind = KindSchema.parse(kindRaw);
    const { name, buf } = await readFile(formData);
    const supabase = await createClient();

    if (kind === "queue") {
      const r = parseQueue(readSheets(buf));
      const minDate = r.rows.reduce((m, x) => (x.work_date < m ? x.work_date : m), "9999-12-31");
      const existing = new Set(
        (await fetchAll<{ dedupe_key: string }>((a, b) =>
          supabase.from("drive_logs").select("dedupe_key").gte("work_date", minDate).order("id").range(a, b))).map((x) => x.dedupe_key),
      );
      const fresh = r.rows.filter((x) => !existing.has(x.dedupe_key));
      const { data: known } = await supabase.from("projects").select("code").in("code", [...new Set(fresh.map((x) => x.project_code))]);
      const knownSet = new Set((known ?? []).map((x) => x.code));
      const newProjects = new Set(fresh.filter((x) => !knownSet.has(x.project_code)).map((x) => x.project_code));
      return {
        ok: true, kind, fileName: name,
        stats: [
          { label: "แถวใหม่ที่จะเพิ่ม", value: fresh.length, tone: "new" },
          { label: "มีอยู่แล้ว (ข้าม)", value: r.rows.length - fresh.length, tone: "dup" },
          { label: "แถวผิด", value: r.errors.length, tone: "err" },
          { label: "โครงการใหม่", value: newProjects.size, tone: "warn" },
        ],
        sample: fresh.slice(-200).reverse().map((x) => ({
          วันที่: x.work_date, โครงการ: x.project_code, ปั้นจั่น: x.rig_name, ขนาด: x.size_code, ยาว: x.length_m ?? "", กะ: x.shift, ต้น: x.qty,
          หมายเหตุ: knownSet.has(x.project_code) ? "" : "โครงการใหม่",
        })),
        errors: r.errors.slice(0, 50).map((e) => `แถว ${e.row}: ${e.reason}`),
        note: `แท็บ ${r.sheet} · ${r.rows.length.toLocaleString("th-TH")} แถวที่อ่านได้`,
      };
    }
    if (kind === "master_planning") {
      const r = parseMasterPlanning(readSheets(buf, ["Pile", " Pile"]), await legacyCutoff());
      const by = (s: string) => r.projects.filter((p) => p.status === s).length;
      return {
        ok: true, kind, fileName: name,
        stats: [
          { label: "โครงการ", value: r.projects.length, tone: "new" },
          { label: "กำลังตอก", value: by("ongoing") },
          { label: "วันที่มีแผน", value: r.plans.length },
          { label: "หมายเหตุรายวัน", value: r.notes.length, tone: "warn" },
        ],
        sample: r.projects.filter((p) => p.status === "ongoing" || p.status === "on_hand").map((p) => ({
          รหัส: p.code, โครงการ: p.project_name, สถานะ: p.status, สั่งซื้อ: p.order_qty, เริ่ม: p.start_date ?? "", เสร็จ: p.end_date ?? "", รอบวางบิล: p.billing_cycle,
        })),
        errors: [],
        note: "ข้อมูลโครงการและแผนรายวันของโครงการในไฟล์จะถูกแทนที่ด้วยไฟล์นี้ (หมายเหตุที่พิมพ์ในเว็บจะไม่ถูกทับ)",
      };
    }
    const r = parseSales(readSheets(buf, ["dataรวม"]));
    const count = (t: string) => r.docs.filter((d) => d.doc_type === t).length;
    return {
      ok: true, kind, fileName: name,
      stats: [
        { label: "P เปิดขาย", value: count("P"), tone: "new" },
        { label: "R ลด/เปลี่ยน", value: count("R") },
        { label: "C ลด/เปลี่ยน", value: count("C") },
        { label: "ลูกค้า", value: r.customers.length, tone: "warn" },
      ],
      sample: r.docs.slice(0, 200).map((d) => ({ วันที่: d.doc_date, ประเภท: d.doc_type, SO: d.so_code, โครงการ: d.project_code, ลูกค้า: d.customer_name, จำนวน: d.qty, มูลค่า: d.amount })),
      errors: r.skipped ? [`ข้าม ${r.skipped} แถวที่ไม่ใช่เอกสาร P/R/C`] : [],
      note: `เอกสารขายช่วง ${r.from} ถึง ${r.to} จะถูกแทนที่ด้วยไฟล์นี้`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้" };
  }
}

export async function commitImport(kindRaw: string, formData: FormData): Promise<CommitResult> {
  try {
    await requireRole(EDITORS);
    const kind = KindSchema.parse(kindRaw);
    const { name, buf } = await readFile(formData);
    const supabase = await createClient();
    let message = "";
    if (kind === "queue") {
      const r = parseQueue(readSheets(buf));
      const { data, error } = await supabase.rpc("import_drive_logs", { p_file_name: name, p_rows: r.rows, p_error_rows: r.errors.length });
      if (error) throw new Error(error.message);
      message = `เพิ่ม ${Number(data.added).toLocaleString("th-TH")} แถว · ข้ามที่มีอยู่แล้ว ${Number(data.duplicate).toLocaleString("th-TH")} แถว`;
    } else if (kind === "master_planning") {
      const r = parseMasterPlanning(readSheets(buf, ["Pile", " Pile"]), await legacyCutoff());
      const { data, error } = await supabase.rpc("import_master_planning", {
        p_file_name: name, p_projects: r.projects, p_plans: r.plans, p_legacy: r.legacy, p_notes: r.notes,
      });
      if (error) throw new Error(error.message);
      message = `อัพเดท ${data.projects} โครงการ · แผน ${Number(data.plans).toLocaleString("th-TH")} วัน · หมายเหตุใหม่ ${data.notes}`;
    } else {
      const r = parseSales(readSheets(buf, ["dataรวม"]));
      const { data, error } = await supabase.rpc("import_sales", {
        p_file_name: name, p_customers: r.customers, p_docs: r.docs, p_from: r.from, p_to: r.to,
      });
      if (error) throw new Error(error.message);
      message = `บันทึกเอกสารขาย ${Number(data.added).toLocaleString("th-TH")} รายการ (แทนที่ของเดิม ${data.replaced})`;
    }
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
}

export async function undoImport(batchId: string): Promise<CommitResult> {
  try {
    await requireRole(EDITORS);
    const id = z.uuid().parse(batchId);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("undo_import", { p_batch: id });
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true, message: `ย้อนกลับแล้ว ลบ ${data} แถว` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ" };
  }
}
