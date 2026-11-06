import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { canSeeSales } from "@/lib/roles";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { getProjects, type ProjectRow } from "@/lib/data";
import { addDays, dayRange, dow, fDate, fMonth, fNum, TH_DAYS, todayBangkok } from "@/lib/format";
import { addMonths } from "@/lib/salesMeeting";
import { Empty, PageHeader } from "@/components/ui";
import { ScrollToToday } from "./ScrollToToday";
import { TimelinePdf } from "./TimelinePdf";

export const metadata: Metadata = { title: "Project Timeline" };

// Project Timeline รวมโครงการ Ongoing / On Hand / Hold — รูปแบบเดียวกับแท็บ Pile ใน Master Planning
// (โครงการละ 2 แถว Plan / Actual × รายวัน แบ่งตามเดือน) · Plan = project_plan_days, Actual = v_project_actual_days
const GROUPS = [
  { key: "ongoing", label: "1-Ongoing", cls: "on" },
  { key: "on_hand", label: "2-On Hand", cls: "oh" },
  { key: "hold", label: "3-Hold", cls: "hd" },
] as const;

const M2 = (n: number) => (n / 1e6).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function TimelinePage(props: PageProps<"/timeline">) {
  const user = await requirePage("timeline");
  const money = canSeeSales(user.role);
  const sp = await props.searchParams;
  const today = todayBangkok();
  const curMonth = today.slice(0, 8) + "01";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  // ช่วงเวลา (ไม่มีปุ่มเลือก): ต้นเดือนของแผน/ผลงานวันแรก → สิ้นเดือนของแผนวันสุดท้าย (อย่างน้อยถึงสิ้นเดือน +2 จากเดือนนี้)
  const supabase = await createClient();
  const projects = await getProjects(supabase, { status: ["ongoing", "on_hand", "hold"] });
  const codes = projects.map((p) => p.code);
  const [plans, actuals] = codes.length ? await Promise.all([
    fetchAll<{ project_code: string; plan_date: string; planned_qty: number }>((a, b) =>
      supabase.from("project_plan_days").select("project_code, plan_date, planned_qty").in("project_code", codes).gt("planned_qty", 0)
        .order("project_code").order("plan_date").range(a, b)),
    fetchAll<{ project_code: string; work_date: string; qty: number }>((a, b) =>
      supabase.from("v_project_actual_days").select("project_code, work_date, qty").in("project_code", codes)
        .order("project_code").order("work_date").range(a, b)),
  ]) : [[], []];

  const firstDate = [...plans.map((r) => r.plan_date), ...actuals.map((r) => r.work_date)].reduce((m, d) => (d < m ? d : m), curMonth);
  const from = firstDate.slice(0, 8) + "01";
  const lastPlan = plans.reduce((m, r) => (r.plan_date > m ? r.plan_date : m), "");
  const minTo = addDays(addMonths(curMonth, 3), -1);
  const to = lastPlan > minTo ? addDays(addMonths(lastPlan.slice(0, 8) + "01", 1), -1) : minTo;
  const notes = await fetchAll<{ project_code: string | null; note_date: string; body: string }>((a, b) =>
    supabase.from("daily_notes").select("project_code, note_date, body").gte("note_date", from).lte("note_date", to).order("id").range(a, b));
  const days = dayRange(from, to);
  const idx = new Map(days.map((d, i) => [d, i]));
  const grid = (rows: { code: string | null; date: string; v: number }[]) => {
    const m = new Map<string, number[]>();
    for (const r of rows) {
      const i = idx.get(r.date);
      if (i == null || !r.code) continue;
      const a = m.get(r.code) ?? m.set(r.code, new Array(days.length).fill(0)).get(r.code)!;
      a[i] += Number(r.v) || 0;
    }
    return m;
  };
  const planBy = grid(plans.map((r) => ({ code: r.project_code, date: r.plan_date, v: r.planned_qty })));
  const actBy = grid(actuals.map((r) => ({ code: r.project_code, date: r.work_date, v: r.qty })));
  const noteBy = new Map<string, string>();
  for (const n of notes) if (n.project_code) noteBy.set(`${n.project_code}|${n.note_date}`, n.body);
  const companyNote = new Map(notes.filter((n) => !n.project_code).map((n) => [n.note_date, n.body]));

  const match = (p: ProjectRow) => !q || `${p.code} ${p.customer_name} ${p.project_name} ${p.pm} ${p.sales}`.toLowerCase().includes(q);
  const firstIdx = (p: ProjectRow) => {
    const a = planBy.get(p.code) ?? actBy.get(p.code);
    const i = a ? a.findIndex((v) => v > 0) : -1;
    return i < 0 ? 9999 : i;
  };
  const groups = GROUPS.map((g) => {
    const rows = projects
      .filter((p) => p.status === g.key && match(p))
      .sort((a, b) => firstIdx(a) - firstIdx(b) || (a.start_date ?? "9").localeCompare(b.start_date ?? "9") || a.code.localeCompare(b.code));
    const sum = (f: (p: ProjectRow) => number) => rows.reduce((s, p) => s + f(p), 0);
    return { ...g, rows, qty: sum((p) => p.remain_qty), val: rows.reduce((s, p) => s + p.value_remain, 0) };
  });
  const all = groups.flatMap((g) => g.rows);

  const months: { m: string; len: number }[] = [];
  for (const d of days) {
    const last = months[months.length - 1];
    if (last && last.m === d.slice(0, 7)) last.len++; else months.push({ m: d.slice(0, 7), len: 1 });
  }
  const todayIdx = idx.get(today);
  const cell = (v: number) => (v ? fNum(v, 1) : "");

  return (
    <>
      <PageHeader
        title="Project Timeline"
        sub="แผนตอกเทียบผลงานรายวัน รวมโครงการ Ongoing · On Hand · Hold — รูปแบบเดียวกับแท็บ Pile ใน Master Planning"
      />
      <div className="card">
        <div className="tl-sum">
          <span className="chip">{fDate(from)} – {fDate(to)}</span>
          {groups.map((g) => (
            <span key={g.key} className={`tl-chip ${g.cls}`}>
              <b>{g.label}</b> {g.rows.length} โครงการ · คงเหลือ {fNum(g.qty)} ต้น{money && <> · {M2(g.val)} ล้านบาท</>}
            </span>
          ))}
          <span className="tl-legend"><i className="lg-plan" />แผน <i className="lg-ok" />ตอกได้ตามแผน <i className="lg-low" />ต่ำกว่าแผน <i className="lg-nt" />มีหมายเหตุ</span>
          <form action="/timeline">
            <input className="input" name="q" defaultValue={q} placeholder="ค้นหารหัส / ลูกค้า / PM / Sales…" style={{ width: 230 }} />
          </form>
          {all.length > 0 && <TimelinePdf fileName={`Project Timeline ${today}`} />}
        </div>

        {all.length === 0 ? <Empty>ไม่พบโครงการตามตัวกรอง</Empty> : (
          <div className="tl-wrap" id="tl-wrap">
            <table className="tl">
              <thead>
                <tr>
                  <th className="tl-s tl-c1" /><th className="tl-s tl-c2" /><th className="tl-s tl-c3" /><th className="tl-s tl-c4" /><th className="tl-s tl-c5" />
                  {months.map((m) => <th key={m.m} colSpan={m.len} className="tl-mon">{fMonth(m.m)}</th>)}
                </tr>
                <tr>
                  <th className="tl-s tl-c1">โครงการ / ลูกค้า</th>
                  <th className="tl-s tl-c2 num">สั่งซื้อ<small>ต้น</small></th>
                  <th className="tl-s tl-c3 num">คงเหลือ<small>ต้น</small></th>
                  <th className="tl-s tl-c4 num">Ahead/<small>Behind</small></th>
                  <th className="tl-s tl-c5">วันที่</th>
                  {days.map((d, i) => {
                    const w = dow(d);
                    return (
                      <th key={d} data-today={i === todayIdx ? "1" : undefined}
                        className={`tl-d ${w === 0 ? "sun" : ""} ${i === todayIdx ? "today" : ""} ${d.endsWith("-01") ? "m1" : ""}`}
                        title={companyNote.get(d) ? `ทั้งบริษัท: ${companyNote.get(d)}` : fDate(d)}>
                        {Number(d.slice(8, 10))}<small>{TH_DAYS[w]}</small>{companyNote.get(d) && <i className="ni" />}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => renderGroup(g, gi))}
              </tbody>
            </table>
          </div>
        )}
        <ScrollToToday />
      </div>
    </>
  );

  function renderGroup(g: (typeof groups)[number], gi: number) {
    return (
      <Fragment key={g.key}>
        {g.rows.map((p, ri) => {
          const plan = planBy.get(p.code), act = actBy.get(p.code);
          const ab = p.ahead_behind;
          return [
            <tr key={`${p.code}p`} className={`tl-p ${gi > 0 && ri === 0 ? "tl-gsep" : ""}`}>
              <td className="tl-s tl-c1" rowSpan={2}>
                <Link href={`/projects/${encodeURIComponent(p.code)}`} className={`tl-code ${g.cls}`}>{p.code}</Link>
                <span className="tl-name" title={`${p.customer_name} · ${p.project_name}`}>{p.customer_name}<small>{p.project_name}</small></span>
                <span className="tl-meta">
                  {p.pm && <>PM {p.pm}</>}{p.pm && p.sales && " · "}{p.sales && <>Sales {p.sales}</>}
                  {" · "}{fDate(p.start_date)} – {fDate(p.end_date)}
                </span>
              </td>
              <td className="tl-s tl-c2 num" rowSpan={2}>{fNum(p.order_qty)}</td>
              <td className="tl-s tl-c3 num" rowSpan={2}><b>{fNum(p.remain_qty)}</b>{money && <small>{M2(p.value_remain)} ล.</small>}</td>
              <td className={`tl-s tl-c4 num tl-ab ${ab >= 0 ? "up" : "down"}`} rowSpan={2}>{p.has_plan ? `${ab >= 0 ? "+" : ""}${fNum(ab)}` : "–"}</td>
              <td className="tl-s tl-c5 pa">Plan</td>
              {!plan && !act ? (
                <td colSpan={days.length} className="tl-none">
                  {p.end_note ? `${p.end_note} · ` : ""}ยังไม่มีแผน{p.start_date ? ` · กำหนดเริ่ม ${fDate(p.start_date)}` : ""}
                </td>
              ) : days.map((d, i) => {
                const v = plan?.[i] ?? 0;
                return <td key={i} className={cx(dayCls(d, i, todayIdx), v ? `pl ${g.cls}` : "")}>{cell(v)}</td>;
              })}
            </tr>,
            <tr key={`${p.code}a`} className="tl-a">
              <td className="tl-s tl-c5 pa">Actual</td>
              {!plan && !act ? <td colSpan={days.length} className="tl-none" /> : days.map((d, i) => {
                const v = act?.[i] ?? 0;
                const note = noteBy.get(`${p.code}|${d}`);
                return (
                  <td key={i} className={cx(dayCls(d, i, todayIdx), actCls(v, plan?.[i] ?? 0), note ? "nt" : "")} title={note}>
                    {cell(v)}
                  </td>
                );
              })}
            </tr>,
          ];
        })}
      </Fragment>
    );
  }
}

function dayCls(d: string, i: number, todayIdx?: number): string {
  return cx(dow(d) === 0 ? "sun" : "", i === todayIdx ? "today" : "", d.endsWith("-01") ? "m1" : "") ?? "";
}
function actCls(v: number, plan: number) {
  if (!v) return "";
  return !plan || v >= plan ? "ok" : "low";
}
/** รวมคลาสที่ไม่ว่าง — ตารางมีหลายหมื่นช่อง ลดขนาด HTML */
function cx(...c: string[]) {
  return c.filter(Boolean).join(" ") || undefined;
}
