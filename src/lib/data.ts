import "server-only";
import { fetchAll, type Supa } from "@/lib/supabase/server";
import { todayBangkok } from "@/lib/format";

export type ProjectStatus = "ongoing" | "on_hand" | "hold" | "completed" | "cancelled";
export type Project = {
  code: string; customer_name: string; project_name: string; agency: string; province: string; pm: string; sales: string;
  status: ProjectStatus; order_qty: number; contract_value: number; value_per_pile: number; start_date: string | null;
  end_date: string | null; billing_cycle: string; end_note: string; order_source: string;
};
export type Progress = {
  project_code: string; done_qty: number; plan_to_date: number; plan_total: number; has_plan: boolean;
  ahead_behind: number; remain_qty: number; rate_per_day: number; eta: string | null; pct_done: number;
  pct_plan: number; value_done: number; value_remain: number;
};
export type ProjectRow = Project & Progress;

// มูลค่าเงิน (contract_value, value_per_pile) อ่านจาก v_project_money เท่านั้น — ฝ่ายตอก/ฝ่ายผลิตได้แถวว่าง = 0
const PROJECT_COLS = "code, customer_name, project_name, agency, province, pm, sales, status, order_qty, start_date, end_date, billing_cycle, end_note, order_source";
const PROGRESS_COLS = "project_code, done_qty, plan_to_date, plan_total, has_plan, ahead_behind, remain_qty, rate_per_day, eta, pct_done, pct_plan, value_done, value_remain";

const n = (v: unknown) => (v == null ? 0 : Number(v));

/** โครงการทั้งหมด + ความคืบหน้าจาก view (คำนวณในฐานข้อมูล) — asof = ดูย้อนหลัง ณ วันที่นั้น */
export async function getProjects(supabase: Supa, filter?: { codes?: string[]; status?: ProjectStatus[]; asof?: string }): Promise<ProjectRow[]> {
  const [projects, progress, money] = await Promise.all([
    fetchAll<Omit<Project, "contract_value" | "value_per_pile">>((a, b) => {
      let q = supabase.from("projects").select(PROJECT_COLS).order("code").range(a, b);
      if (filter?.codes) q = q.in("code", filter.codes);
      if (filter?.status) q = q.in("status", filter.status);
      return q;
    }),
    fetchAll<Progress>((a, b) => {
      let q = viewAt(supabase, "v_project_progress", "project_progress_at", filter?.asof).select(PROGRESS_COLS).order("project_code").range(a, b);
      if (filter?.codes) q = q.in("project_code", filter.codes);
      if (filter?.status) q = q.in("status", filter.status);
      return q;
    }),
    fetchAll<{ code: string; contract_value: number; value_per_pile: number }>((a, b) => {
      const q = supabase.from("v_project_money").select("code, contract_value, value_per_pile").order("code").range(a, b);
      return filter?.codes ? q.in("code", filter.codes) : q;
    }),
  ]);
  const pm = new Map(progress.map((p) => [p.project_code, p]));
  const mm = new Map(money.map((m) => [m.code, m]));
  return projects.map((p) => {
    const g = pm.get(p.code);
    return {
      ...p,
      order_qty: n(p.order_qty), contract_value: n(mm.get(p.code)?.contract_value), value_per_pile: n(mm.get(p.code)?.value_per_pile),
      project_code: p.code, done_qty: n(g?.done_qty), plan_to_date: n(g?.plan_to_date), plan_total: n(g?.plan_total),
      has_plan: !!g?.has_plan, ahead_behind: n(g?.ahead_behind), remain_qty: n(g?.remain_qty), rate_per_day: n(g?.rate_per_day),
      eta: g?.eta ?? null, pct_done: n(g?.pct_done), pct_plan: n(g?.pct_plan), value_done: n(g?.value_done), value_remain: n(g?.value_remain),
    };
  });
}

export type Backlog = {
  asof: string; backlog_qty: number; backlog_value: number; ongoing_qty: number; on_hand_qty: number; hold_qty: number;
  hold_value: number; rate_per_week: number; threshold_weeks: number; runway_weeks: number | null; level: "red" | "amber" | "green";
};
export async function getBacklog(supabase: Supa, asof?: string): Promise<Backlog> {
  const { data } = await viewAt(supabase, "v_backlog", "backlog_at", asof).select("*").maybeSingle();
  return {
    asof: data?.asof ?? todayBangkok(), backlog_qty: n(data?.backlog_qty), backlog_value: n(data?.backlog_value),
    ongoing_qty: n(data?.ongoing_qty), on_hand_qty: n(data?.on_hand_qty), hold_qty: n(data?.hold_qty), hold_value: n(data?.hold_value),
    rate_per_week: n(data?.rate_per_week), threshold_weeks: n(data?.threshold_weeks) || 4,
    runway_weeks: data?.runway_weeks == null ? null : Number(data.runway_weeks), level: (data?.level ?? "green") as Backlog["level"],
  };
}

export async function getAsof(supabase: Supa): Promise<string> {
  const { data } = await supabase.from("v_data_asof").select("asof").maybeSingle();
  return data?.asof ?? todayBangkok();
}

/** วันที่ "ข้อมูลถึง" ของหน้า: ?asof= ที่ผู้ใช้เลือก (ต้องก่อนวันข้อมูลล่าสุด) ไม่งั้นใช้วันข้อมูลล่าสุด
 *  pick = มีค่าเฉพาะตอนดูย้อนหลัง */
export async function resolveAsof(supabase: Supa, raw: unknown): Promise<{ latest: string; asof: string; pick?: string }> {
  const latest = await getAsof(supabase);
  const ok = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))
    && new Date(raw).toISOString().slice(0, 10) === raw && raw < latest;
  const pick = ok ? (raw as string) : undefined;
  return { latest, asof: pick ?? latest, pick };
}

/** view ปัจจุบัน หรือฟังก์ชัน *_at(p_asof) ที่คืนคอลัมน์เดียวกัน → ใช้ .select/.order/.range ต่อได้เหมือนกัน */
export function viewAt(supabase: Supa, view: string, fn: string, asof?: string) {
  return asof ? (supabase.rpc(fn, { p_asof: asof }) as unknown as ReturnType<Supa["from"]>) : supabase.from(view);
}

export const COMPANY_LABEL: Record<string, string> = { asia: "เอเซีย", asia_joint: "เอเซียร่วม", subcontractor: "ผู้รับเหมาร่วม" };
