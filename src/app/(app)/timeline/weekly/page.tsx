import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { canSeeSales } from "@/lib/roles";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { getProjects, type ProjectRow } from "@/lib/data";
import { addDays, dayRange, dow, fDate, fNum, TH_DAYS, TH_MONTHS, todayBangkok } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { WeeklyPdf } from "./WeeklyPdf";

export const metadata: Metadata = { title: "รายงานประจำสัปดาห์" };

/*
 * รายงาน Project Timeline ประจำสัปดาห์ส่งผู้บริหาร (ผู้ใช้เลือกแบบ A 21 พ.ย. 2569)
 * A3 แนวนอน 2 หน้า: หน้า 1 Ongoing, หน้า 2 On Hand + Hold
 * ช่วงวัน = ผลงาน/แผน 7 วันก่อนวันที่พิมพ์ → แผนล่วงหน้า 2 เดือน · รายวัน แถว Plan / Actual
 */
const GROUPS = [
  { key: "ongoing", title: "งานกำลังตอก (1-Ongoing)", cls: "on", page: 1 },
  { key: "on_hand", title: "งานรอเริ่ม (2-On Hand)", cls: "oh", page: 2 },
  { key: "hold", title: "งานชะลอโครงการ (3-Hold)", cls: "hd", page: 2 },
] as const;

const fAB = (n: number) => (Math.abs(n) < 0.5 ? "0" : (n > 0 ? "+" : "") + fNum(n));
const M2 = (n: number) => (n / 1e6).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** วันเดียวกันอีก n เดือน (31 ม.ค. + 1 = 28/29 ก.พ.) */
function plusMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

export default async function WeeklyReportPage(props: PageProps<"/timeline/weekly">) {
  const user = await requirePage("timeline");
  const money = canSeeSales(user.role);
  const sp = await props.searchParams;
  const print = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayBangkok();
  const from = addDays(print, -7), to = addDays(plusMonths(print, 2), -1), lastWeekTo = addDays(print, -1);
  const days = dayRange(from, to);

  const supabase = await createClient();
  const projects = await getProjects(supabase, { status: ["ongoing", "on_hand", "hold"] });
  const codes = projects.map((p) => p.code);
  const [plans, actuals, asofRow] = await Promise.all([
    codes.length ? fetchAll<{ project_code: string; plan_date: string; planned_qty: number }>((a, b) =>
      supabase.from("project_plan_days").select("project_code, plan_date, planned_qty").in("project_code", codes)
        .gte("plan_date", from).lte("plan_date", to).order("project_code").order("plan_date").range(a, b)) : [],
    codes.length ? fetchAll<{ project_code: string; work_date: string; qty: number }>((a, b) =>
      supabase.from("v_project_actual_days").select("project_code, work_date, qty").in("project_code", codes)
        .gte("work_date", from).lte("work_date", to).order("project_code").order("work_date").range(a, b)) : [],
    supabase.from("v_data_asof").select("asof").maybeSingle(),
  ]);
  const asof = asofRow.data?.asof as string | undefined;
  const P = new Map<string, number>(), A = new Map<string, number>();
  for (const r of plans) P.set(`${r.project_code}|${r.plan_date}`, (P.get(`${r.project_code}|${r.plan_date}`) ?? 0) + Number(r.planned_qty));
  for (const r of actuals) A.set(`${r.project_code}|${r.work_date}`, (A.get(`${r.project_code}|${r.work_date}`) ?? 0) + Number(r.qty));
  const pv = (c: string, d: string) => P.get(`${c}|${d}`) ?? 0;
  const av = (c: string, d: string) => A.get(`${c}|${d}`) ?? 0;

  const sorted = [...projects].sort((a, b) => (a.start_date ?? "9").localeCompare(b.start_date ?? "9") || a.code.localeCompare(b.code));
  const groups = GROUPS.map((g) => ({ ...g, items: sorted.filter((p) => p.status === g.key) }));

  // หัวเดือน
  const months: { m: string; n: number }[] = [];
  for (const d of days) { const m = d.slice(0, 7); if (months.at(-1)?.m === m) months.at(-1)!.n++; else months.push({ m, n: 1 }); }
  const dayCls = (d: string) => `${dow(d) === 0 ? "sun" : ""} ${d === print ? "today" : ""} ${d < print ? "pastd" : ""}`;
  const actCls = (c: string, d: string) => { const a = av(c, d), p = pv(c, d); return a ? (a >= p ? "ok" : "lo") : p && d < print ? "miss" : ""; };
  const num = (v: number) => (v ? (v >= 100 ? <small>{fNum(v)}</small> : fNum(v)) : "");
  const infoCols = money ? 10 : 9;

  const kpi = (g: (typeof groups)[number]) => {
    const order = g.items.reduce((s, r) => s + r.order_qty, 0), remain = g.items.reduce((s, r) => s + r.remain_qty, 0);
    const value = g.items.reduce((s, r) => s + r.contract_value, 0);
    return (
      <span key={g.key} className={`wk-kpi ${g.cls}`}>
        <b>{g.title}</b> {g.items.length} โครงการ · สั่งซื้อ {fNum(order)} ต้น{money ? ` · ${M2(value)} ล้านบาท` : ""} · คงเหลือ {fNum(remain)} ต้น
      </span>
    );
  };

  const table = (items: ProjectRow[]) => (
    <table className="wk-grid">
      <colgroup>
        <col style={{ width: "5mm" }} /><col style={{ width: money ? "58mm" : "71mm" }} /><col style={{ width: "16mm" }} /><col style={{ width: "20mm" }} />
        <col style={{ width: "13mm" }} />{money && <col style={{ width: "13mm" }} />}<col style={{ width: "13mm" }} /><col style={{ width: "13mm" }} />
        <col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "9mm" }} />
        {days.map((d) => <col key={d} />)}
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2}>#</th><th rowSpan={2}>ลูกค้า / โครงการ</th><th rowSpan={2}>รหัสโครงการ</th><th rowSpan={2}>PM / Sales</th>
          <th rowSpan={2}>สั่งซื้อ<small>ต้น</small></th>{money && <th rowSpan={2}>มูลค่าสั่งซื้อ<small>ล้านบาท</small></th>}
          <th rowSpan={2}>คงเหลือตอก<small>ต้น</small></th><th rowSpan={2}>Ahead/<br />Behind</th>
          <th rowSpan={2}>วันเริ่มงาน</th><th rowSpan={2}>วันจบงาน</th><th rowSpan={2} />
          {months.map((x) => <th key={x.m} colSpan={x.n} className="mh">{TH_MONTHS[+x.m.slice(5) - 1]} {(+x.m.slice(0, 4) + 543) % 100}</th>)}
        </tr>
        <tr>{days.map((d) => <th key={d} className={`dh ${dayCls(d)}`}>{+d.slice(8)}<small>{TH_DAYS[dow(d)]}</small></th>)}</tr>
      </thead>
      <tbody>
        {items.map((r, i) => {
          const ab = !r.has_plan ? "na" : r.ahead_behind >= 0.5 ? "g" : r.ahead_behind <= -0.5 ? "r" : "";
          return [
            <tr key={r.code} className="pl">
              <td rowSpan={2} className="c-no">{i + 1}</td>
              <td rowSpan={2} className="c-name"><b>{r.customer_name}</b><span>{r.project_name}</span></td>
              <td rowSpan={2} className="c-code">{r.code}</td>
              <td rowSpan={2} className="c-pm">{r.pm || "–"}<span>{r.sales || "–"}</span></td>
              <td rowSpan={2} className="c-n">{fNum(r.order_qty)}</td>
              {money && <td rowSpan={2} className="c-n">{M2(r.contract_value)}</td>}
              <td rowSpan={2} className="c-n b">{fNum(r.remain_qty)}</td>
              <td rowSpan={2} className={`c-n ab ${ab}`}>{r.has_plan ? fAB(r.ahead_behind) : "ไม่มีแผน"}</td>
              <td rowSpan={2} className="c-d">{fDate(r.start_date)}</td>
              <td rowSpan={2} className="c-d">{fDate(r.end_date)}</td>
              <td className="c-row">Plan</td>
              {days.map((d) => <td key={d} className={`wd ${dayCls(d)} ${pv(r.code, d) ? "p" : ""}`}>{num(pv(r.code, d))}</td>)}
            </tr>,
            <tr key={r.code + "a"} className="ac">
              <td className="c-row">Actual</td>
              {days.map((d) => <td key={d} className={`wd ${dayCls(d)} ${actCls(r.code, d)}`}>{num(av(r.code, d))}</td>)}
            </tr>,
          ];
        })}
        {!items.length && <tr><td colSpan={infoCols + 1 + days.length} className="empty">ไม่มีโครงการ</td></tr>}
      </tbody>
    </table>
  );

  const header = (page: number, sub: string) => (
    <header>
      <div>
        <h1>Project Timeline · รายงานประจำสัปดาห์</h1>
        <p>{sub} · ผลงานย้อนหลัง {fDate(from)} – {fDate(lastWeekTo)} · แผนล่วงหน้า {fDate(print)} – {fDate(to)}</p>
      </div>
      <div className="meta"><b>พิมพ์ {fDate(print)}</b><span>ผลงานตอกถึง {fDate(asof)} · หน้า {page}/2</span></div>
    </header>
  );
  const legend = (
    <div className="wk-legend">
      <span><i className="p" />แผน</span><span><i className="ok" />ตอกได้ตามแผน</span><span><i className="lo" />ต่ำกว่าแผน</span>
      <span><i className="miss" />มีแผนแต่ไม่ได้ตอก</span><span><i className="today" />วันที่พิมพ์</span>
    </div>
  );
  const fileName = `รายงานประจำสัปดาห์ ${fDate(print)}`;

  return (
    <>
      <div className="toolbar wk-tools">
        <Link href="/timeline" className="btn ghost sm"><Icon name="gantt" />Project Timeline</Link>
        <h2 style={{ margin: 0, fontSize: 18 }}>รายงานประจำสัปดาห์ (A3 แนวนอน)</h2>
        <div className="grow" />
        <form action="/timeline/weekly" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label className="muted" htmlFor="wk-date">วันที่พิมพ์</label>
          <input id="wk-date" className="input" type="date" name="date" defaultValue={print} />
          <button className="btn ghost sm" type="submit">แสดง</button>
        </form>
        <WeeklyPdf fileName={fileName} />
      </div>
      <div className="wk-scroll">
        <div className="wk">
          <section className="wk-page">
            <div className="wk-in">
              {header(1, "งานกำลังตอก (Ongoing)")}
              <div className="wk-top"><div className="wk-kpis">{kpi(groups[0])}</div>{legend}</div>
              {table(groups[0].items)}
            </div>
          </section>
          <section className="wk-page">
            <div className="wk-in">
              {header(2, "งานรอเริ่ม (On Hand) และงานชะลอ (Hold)")}
              <div className="wk-top"><div className="wk-kpis">{kpi(groups[1])}{kpi(groups[2])}</div>{legend}</div>
              <h3 className="oh">{groups[1].title}</h3>{table(groups[1].items)}
              <h3 className="hd">{groups[2].title}</h3>{table(groups[2].items)}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
