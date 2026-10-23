import "server-only";
import { fetchAll, type Supa } from "@/lib/supabase/server";
import { getAsof, getProjects } from "@/lib/data";

export type BillingRow = {
  code: string; name: string; customer: string; billing: string; done: number; vpp: number; valueDone: number; monthQty: number; monthValue: number;
};

/** รายงานวางบิลเดือนของวันที่ข้อมูลล่าสุด: โครงการที่กำลังตอก หรือมีผลงานในเดือนนั้น */
export async function getBilling(supabase: Supa): Promise<{ asof: string; month: string; rows: BillingRow[] }> {
  const asof = await getAsof(supabase);
  const month = asof.slice(0, 7);
  const [projects, logs] = await Promise.all([
    getProjects(supabase),
    fetchAll<{ project_code: string; qty: number }>((a, b) =>
      supabase.from("drive_logs").select("project_code, qty").gte("work_date", `${month}-01`).lte("work_date", asof).order("id").range(a, b)),
  ]);
  const mq = new Map<string, number>();
  logs.forEach((l) => mq.set(l.project_code, (mq.get(l.project_code) ?? 0) + Number(l.qty)));
  const rows = projects
    .filter((p) => p.status === "ongoing" || (mq.get(p.code) ?? 0) > 0)
    .map((p) => ({
      code: p.code, name: p.project_name, customer: p.customer_name, billing: p.billing_cycle, done: p.done_qty,
      vpp: p.value_per_pile, valueDone: p.value_done, monthQty: mq.get(p.code) ?? 0, monthValue: (mq.get(p.code) ?? 0) * p.value_per_pile,
    }))
    .sort((a, b) => b.monthValue - a.monthValue);
  return { asof, month, rows };
}

export const BILLING_HEADERS = ["รหัสโครงการ", "โครงการ", "ลูกค้า", "รอบวางบิล", "ตอกแล้ว", "มูลค่า/ต้น", "มูลค่าผลงานสะสม", "ต้นเดือนนี้", "มูลค่าเดือนนี้"];
export const billingRow = (r: BillingRow) => [r.code, r.name, r.customer, r.billing, round(r.done), round(r.vpp), round(r.valueDone), round(r.monthQty), round(r.monthValue)];
const round = (n: number) => Math.round(n * 100) / 100;
