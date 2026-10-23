import { createClient, fetchAll } from "@/lib/supabase/server";
import { getAsof } from "@/lib/data";
import { addDays, dayRange, fDate } from "@/lib/format";
import { canExport, forbidden, xlsxResponse } from "@/lib/xlsxResponse";

export async function GET() {
  if (!(await canExport("drive"))) return forbidden();
  const supabase = await createClient();
  const asof = await getAsof(supabase);
  const days = dayRange(addDays(asof, 1), addDays(asof, 7));
  const [rigs, plans] = await Promise.all([
    fetchAll<{ rig_name: string; company_raw: string; leader: string; last_project: string; last_date: string; idle_days: number }>((a, b) =>
      supabase.from("v_rig_status").select("rig_name, company_raw, leader, last_project, last_date, idle_days").gte("last_date", addDays(asof, -29)).range(a, b)),
    fetchAll<{ project_code: string; plan_date: string; planned_qty: number }>((a, b) =>
      supabase.from("project_plan_days").select("project_code, plan_date, planned_qty").gte("plan_date", days[0]).lte("plan_date", days[6]).range(a, b)),
  ]);
  const plan = new Map(plans.map((p) => [`${p.project_code}|${p.plan_date}`, Number(p.planned_qty)]));
  const aoa = [
    ["ปั้นจั่น", "บริษัท", "หัวหน้าสาย", "โครงการ", "ทำงานล่าสุด", ...days.map(fDate)],
    ...rigs.sort((a, b) => a.last_project.localeCompare(b.last_project)).map((r) => {
      const idle = Number(r.idle_days) > 3;
      return [r.rig_name, r.company_raw, r.leader, idle ? "ว่าง" : r.last_project, r.last_date, ...days.map((d) => (idle ? "" : plan.get(`${r.last_project}|${d}`) ?? ""))];
    }),
  ];
  return xlsxResponse(`คิวปั้นจั่น ${asof}.xlsx`, "คิวปั้นจั่น", aoa);
}
