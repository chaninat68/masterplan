import { createClient, fetchAll } from "@/lib/supabase/server";
import { getAsof, getProjects } from "@/lib/data";
import { dayRange } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { canSeeSales } from "@/lib/roles";
import { canExport, forbidden } from "@/lib/xlsxResponse";
import { buildMasterPlanningXlsx } from "@/lib/export/masterPlanningXlsx";

/**
 * Export Master Planning แบบมีสี (แบบ B, ผู้ใช้เลือก 24 พ.ย. 2569):
 * แท็บ "สถานะโครงการ" = ทุกโครงการรวมแล้วเสร็จ/ยกเลิก + สรุปตามสถานะ,
 * แท็บ "Pile" = รูปแบบเดิม (A–Q + Plan/Actual รายวัน) เฉพาะ Ongoing / On Hand / Hold
 */
export async function GET() {
  if (!(await canExport("projects"))) return forbidden();
  const money = canSeeSales((await getCurrentUser())!.role); // ฝ่ายตอก/ฝ่ายผลิต: ไม่มีมูลค่า
  const supabase = await createClient();
  const [asof, all] = await Promise.all([getAsof(supabase), getProjects(supabase)]);
  const codes = all.filter((p) => p.status === "ongoing" || p.status === "on_hand" || p.status === "hold").map((p) => p.code);
  const [plans, actuals, notes] = codes.length ? await Promise.all([
    fetchAll<{ project_code: string; plan_date: string; planned_qty: number }>((a, b) => supabase.from("project_plan_days").select("project_code, plan_date, planned_qty").in("project_code", codes).order("project_code").order("plan_date").range(a, b)),
    fetchAll<{ project_code: string; work_date: string; qty: number }>((a, b) => supabase.from("v_project_actual_days").select("project_code, work_date, qty").in("project_code", codes).order("project_code").order("work_date").range(a, b)),
    fetchAll<{ project_code: string; note_date: string; body: string }>((a, b) => supabase.from("daily_notes").select("project_code, note_date, body").in("project_code", codes).order("project_code").order("note_date").range(a, b)),
  ]) : [[], [], []];
  const plan = new Map<string, number>(), actual = new Map<string, number>();
  for (const x of plans) plan.set(`${x.project_code}|${x.plan_date}`, (plan.get(`${x.project_code}|${x.plan_date}`) ?? 0) + Number(x.planned_qty));
  for (const x of actuals) actual.set(`${x.project_code}|${x.work_date}`, (actual.get(`${x.project_code}|${x.work_date}`) ?? 0) + Number(x.qty));
  const noteMap = new Map(notes.map((x) => [`${x.project_code}|${x.note_date}`, x.body === "ไม่มีการตอก" ? "x" : x.body]));
  const ds = [...plans.map((x) => x.plan_date), ...actuals.map((x) => x.work_date)].sort();
  const days = ds.length ? dayRange(ds[0], ds[ds.length - 1]) : [];

  const buf = await buildMasterPlanningXlsx(all, { asof, days, plan, actual, notes: noteMap }, money);
  const [y, m, dd] = asof.split("-");
  const fileName = `Master Planning Update ${dd}-${m}-${String(Number(y) + 543).slice(2)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
