import { createClient, fetchAll } from "@/lib/supabase/server";
import { getAsof, getProjects } from "@/lib/data";
import { dayRange, fDate } from "@/lib/format";
import { canExport, forbidden, xlsxResponse } from "@/lib/xlsxResponse";

const STATUS_X: Record<string, string> = { ongoing: "1-Ongoing", on_hand: "2-On Hand", hold: "3-Hold", completed: "5-Completed", cancelled: "6-ยกเลิก" };

/** Export กลับเป็นรูปแบบแท็บ Pile เดิม (คอลัมน์ A–Q + แถว Plan/Actual รายวัน) สำหรับโครงการที่ยังไม่จบ */
export async function GET() {
  if (!(await canExport("projects"))) return forbidden();
  const supabase = await createClient();
  const [asof, all] = await Promise.all([getAsof(supabase), getProjects(supabase, { status: ["ongoing", "on_hand", "hold"] })]);
  const codes = all.map((p) => p.code);
  const [plans, actuals, notes] = await Promise.all([
    fetchAll<{ project_code: string; plan_date: string; planned_qty: number }>((a, b) => supabase.from("project_plan_days").select("project_code, plan_date, planned_qty").in("project_code", codes).order("plan_date").range(a, b)),
    fetchAll<{ project_code: string; work_date: string; qty: number }>((a, b) => supabase.from("v_project_actual_days").select("project_code, work_date, qty").in("project_code", codes).order("work_date").range(a, b)),
    fetchAll<{ project_code: string; note_date: string; body: string }>((a, b) => supabase.from("daily_notes").select("project_code, note_date, body").in("project_code", codes).range(a, b)),
  ]);
  const P = new Map(plans.map((x) => [`${x.project_code}|${x.plan_date}`, Number(x.planned_qty)]));
  const A = new Map(actuals.map((x) => [`${x.project_code}|${x.work_date}`, Number(x.qty)]));
  const N = new Map(notes.map((x) => [`${x.project_code}|${x.note_date}`, x.body === "ไม่มีการตอก" ? "x" : x.body]));
  const ds = [...plans.map((x) => x.plan_date), ...actuals.map((x) => x.work_date)].sort();
  const days = ds.length ? dayRange(ds[0], ds[ds.length - 1]) : [];

  const aoa: (string | number | null)[][] = [[
    "รหัสโครงการ", "PM รับผิดชอบ", "Sales รับผิดชอบ", "สถานะ", "ชื่อลูกค้า", "โครงการ", "สั่งซื้อ", "มูลค่าโครงการ", "มูลค่าเฉลี่ย/ต้น", "ตอกแล้ว",
    "คงเหลือตอก", "Remaining", "คิดเลขรวม", "Ahead or behind schedule", "กำหนดเริ่มงาน", "กำหนดแล้วเสร็จ", "วันที่", ...days.map(fDate),
  ]];
  for (const p of all) {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    aoa.push([p.code, p.pm, p.sales, STATUS_X[p.status], p.customer_name, p.project_name, p.order_qty, p.contract_value, p.value_per_pile, r3(p.done_qty),
      r3(p.remain_qty), p.order_qty ? r3(p.remain_qty / p.order_qty) : 0, p.order_qty, r3(p.ahead_behind), p.start_date, p.end_date, "Plan",
      ...days.map((d) => P.get(`${p.code}|${d}`) ?? null)]);
    aoa.push([p.code, "", "", STATUS_X[p.status], p.billing_cycle, "", null, null, null, null, null, null, null, p.ahead_behind >= 0 ? "Ahead" : "Behind",
      p.start_date, p.end_note || null, "Actual", ...days.map((d) => A.get(`${p.code}|${d}`) ?? N.get(`${p.code}|${d}`) ?? null)]);
  }
  const [y, m, dd] = asof.split("-");
  return xlsxResponse(`Master Planning Update ${dd}-${m}-${String(Number(y) + 543).slice(2)}.xlsx`, "Pile", aoa);
}
