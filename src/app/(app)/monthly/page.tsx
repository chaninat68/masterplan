import type { Metadata } from "next";
import Image from "next/image";
import { requirePage } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { getProjects, type ProjectRow } from "@/lib/data";
import { addDays, dayRange, fDate, fNum, TH_MONTHS, todayBangkok } from "@/lib/format";
import { addMonths } from "@/lib/salesMeeting";
import {
  colTotals, normDelivery, normIssues, normStatus, rowTotal, SERVICE_ROWS, STATUS_COLS,
  type Delivery, type Issue, type StatusData,
} from "@/lib/planningMeeting";
import { Empty, PageHeader } from "@/components/ui";
import { MonthlyPicker, Presenter, type Slide } from "./Presenter";
import { DeleteMeeting, DeliveryEditor, IssuesEditor, MetaEditor, NewMeeting, StatusEditor, type ProjectHint } from "./Editors";

export const metadata: Metadata = { title: "ประชุมประจำเดือน (วางแผน)" };

type Meeting = {
  id: string; meeting_date: string; title: string; status_asof: string; status_counts: unknown; status_values: unknown;
  issues: unknown; delivery: unknown; notes: string;
};

const TH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const ym = (iso: string) => iso.slice(0, 7);
const monthFull = (iso: string) => `${TH_FULL[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(0, 4)) + 543}`;
const dateFull = (iso: string) => `${Number(iso.slice(8, 10))} ${monthFull(iso)}`;
const lastDay = (month: string) => addDays(addMonths(month, 1), -1);
const M = (n: number) => Math.round(n / 1e4) / 100; // บาท → ล้าน 2 ตำแหน่ง
const fM2 = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pctOf = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export default async function MonthlyPage(props: PageProps<"/monthly">) {
  await requirePage("monthly");
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("planning_meetings")
    .select("id, meeting_date, title, status_asof, status_counts, status_values, issues, delivery, notes").order("meeting_date", { ascending: false });
  const list = (data ?? []) as Meeting[];

  const today = todayBangkok();
  const header = (right?: React.ReactNode) => (
    <PageHeader title="ประชุมประจำเดือน — ส่วนงานวางแผน" sub="นำเสนอภาพรวมโครงการในที่ประชุมทุกแผนก · เห็นเฉพาะส่วนงานวางแผน" right={right} />
  );
  if (!list.length)
    return (
      <>
        {header()}
        <div className="card"><Empty>ยังไม่มีข้อมูลประชุม — สร้างครั้งแรกแล้วกรอกข้อมูลแต่ละหัวข้อ</Empty>
          <div style={{ marginTop: 12 }}><NewMeeting defaultDate={today} defaultAsof={today.slice(0, 8) + "01"} /></div>
        </div>
      </>
    );

  const sel = list.find((m) => m.meeting_date === sp.m) ?? list[0];
  const counts = normStatus(sel.status_counts), values = normStatus(sel.status_values);
  const issues = normIssues(sel.issues), delivery = normDelivery(sel.delivery);

  // ช่วงเวลา: สถานะ = เดือนก่อนวันที่อัพเดท (Update 01/10 → ก.ย.) · Timeline/แผนจัดส่ง = เดือนที่ประชุม + 2 เดือน
  const reportMonth = ym(addDays(sel.status_asof, -1)) + "-01";
  const labels = { cur: monthFull(reportMonth), prev: monthFull(addMonths(reportMonth, -12)) };
  const meetMonth = ym(sel.meeting_date) + "-01";
  const tlFrom = meetMonth, tlTo = lastDay(addMonths(meetMonth, 2));

  const [projects, plans, doneInMonth, types] = await Promise.all([
    getProjects(supabase, { status: ["ongoing", "on_hand", "hold", "completed"] }),
    fetchAll<{ project_code: string; plan_date: string; planned_qty: number }>((a, b) =>
      supabase.from("project_plan_days").select("project_code, plan_date, planned_qty").gte("plan_date", tlFrom).lte("plan_date", tlTo).gt("planned_qty", 0)
        .order("project_code").order("plan_date").range(a, b)),
    fetchAll<{ project_code: string }>((a, b) =>
      supabase.from("drive_logs").select("project_code").gte("work_date", reportMonth).lte("work_date", lastDay(reportMonth)).order("project_code").range(a, b)),
    fetchAll<{ code: string; project_type: string }>((a, b) => supabase.from("projects").select("code, project_type").order("code").range(a, b)),
  ]);

  // ---- ค่าแนะนำจากระบบ (แถว "พร้อมตอก" = โครงการใน Master Planning / คิว-วัน) ----
  const workedInMonth = new Set(doneInMonth.map((r) => r.project_code));
  const by = (s: string) => projects.filter((p) => p.status === s);
  const completedInMonth = by("completed").filter((p) => workedInMonth.has(p.code));
  const sumV = (ps: ProjectRow[], f: (p: ProjectRow) => number) => ps.reduce((s, p) => s + f(p), 0);
  const suggestCounts = [completedInMonth.length, by("ongoing").length, by("on_hand").length, 0, by("hold").length];
  const suggestValues = [
    M(sumV(completedInMonth, (p) => p.contract_value)), M(sumV(by("ongoing"), (p) => p.value_remain)),
    M(sumV(by("on_hand"), (p) => p.value_remain)), 0, M(sumV(by("hold"), (p) => p.value_remain)),
  ];
  const hints: ProjectHint[] = projects.filter((p) => p.status !== "completed").map((p) => ({
    code: p.code, customer: p.customer_name, project: p.project_name, value: p.contract_value, outstanding: p.value_remain,
    remain_qty: p.remain_qty, note: p.end_note || "", hold: p.status === "hold",
  }));
  const typeOf = new Map(types.map((p) => [p.code, p.project_type ?? ""]));
  const suggestPiles: Record<string, number> = {};
  for (const r of plans) {
    if (r.plan_date < meetMonth || r.plan_date > lastDay(meetMonth)) continue;
    const t = normType(typeOf.get(r.project_code) ?? "");
    suggestPiles[t] = (suggestPiles[t] ?? 0) + Number(r.planned_qty);
  }

  // ---- Timeline ----
  const days = dayRange(tlFrom, tlTo);
  const dayIdx = new Map(days.map((d, i) => [d, i]));
  const planBy = new Map<string, { d: number; q: number }[]>();
  for (const r of plans) {
    const i = dayIdx.get(r.plan_date);
    if (i == null) continue;
    (planBy.get(r.project_code) ?? planBy.set(r.project_code, []).get(r.project_code)!).push({ d: i, q: Number(r.planned_qty) });
  }
  const tlRows = (["ongoing", "on_hand", "hold"] as const).flatMap((s) =>
    by(s).filter((p) => s === "hold" || planBy.has(p.code))
      .map((p) => ({ p, segs: segments(planBy.get(p.code) ?? []), first: planBy.get(p.code)?.[0]?.d ?? 999 }))
      .sort((a, b) => a.first - b.first || a.p.code.localeCompare(b.p.code)),
  );
  const months = [0, 1, 2].map((k) => addMonths(meetMonth, k));
  const todayIdx = dayIdx.get(today);

  const slides: Slide[] = [
    {
      key: "cover", title: "หน้าปก",
      node: (
        <div className="ps-hero">
          <Image src="/monthly/cover.jpg" alt="ปั้นจั่นตอกเสาเข็มที่หน้างาน" fill priority sizes="(max-width: 1700px) 100vw, 1700px" className="ps-hero-img" />
          <div className="ps-hero-shade" />
          <div className="ps-hero-txt">
            <div className="ps-co">ASIA EXPANSION CONCRETE PRODUCT (1993) CO.,LTD</div>
            <h2>{sel.title}</h2>
            <span className="ps-hero-rule" />
            <div className="ps-date">{dateFull(sel.meeting_date)}</div>
            <div className="ps-sub">ประชุมประจำเดือน · ส่วนงานวางแผน</div>
          </div>
        </div>
      ),
      edit: <MetaEditor key={sel.id} id={sel.id} title={sel.title} statusAsof={sel.status_asof} notes={sel.notes} />,
    },
    {
      key: "agenda", title: "หัวข้อการนำเสนอ",
      node: (
        <div className="ps-agwrap">
          <div className="ps-agimg">
            <Image src="/monthly/agenda.jpg" alt="ภาพมุมสูงโรงงานผลิตเสาเข็ม" fill loading="eager" sizes="(max-width: 900px) 100vw, 45vw" className="ps-hero-img" />
            <div className="ps-agimg-cap">ASIA EXPANSION CONCRETE PRODUCT (1993) CO.,LTD</div>
          </div>
        <div className="ps-agenda">
          <h3 className="ps-h">หัวข้อการนำเสนอ</h3>
          {[
            ["01.", "สถานะโครงการ", "จำนวนโครงการที่ทำงานอยู่ และโครงการที่รอดำเนินการ รวมถึงงาน Potential"],
            ["02.", "Project Timeline", "แผนภาพรวมโครงการที่ทำงานอยู่ และโครงการที่รอดำเนินการ (งานโครงการพร้อมตอก)"],
            ["03.", "แผนงานจัดส่ง", "โครงการส่งอย่างเดียว และโครงการพร้อมตอก · ผลิตภัณฑ์ เสาเข็ม แผ่นพื้น เสากลวง"],
          ].map(([n, t, d]) => (
            <div className="ps-ag" key={n}><span className="ps-ag-n">{n}</span><div><b>{t}</b><p>{d}</p></div></div>
          ))}
        </div>
        </div>
      ),
    },
    { key: "d1", title: "01. สถานะโครงการ", presentOnly: true, node: <Divider n="01." t="สถานะโครงการ" /> },
    {
      key: "counts", title: "สถานะโครงการ (จำนวน)",
      node: <StatusSlide title="สถานะโครงการ" unit="จำนวนโครงการ" data={counts} labels={labels} asof={sel.status_asof} digits={0} />,
      edit: <StatusEditor key={sel.id + "c"} id={sel.id} section="status_counts" data={counts} labels={labels} suggest={suggestCounts} unit="โครงการ" />,
    },
    {
      key: "values", title: "มูลค่าโครงการ (ล้านบาท)",
      node: (
        <StatusSlide title="มูลค่าโครงการ" unit="ล้านบาท" data={values} labels={labels} asof={sel.status_asof} digits={2}
          foot={["* มูลค่าโครงการคำนวณรวมการเปลี่ยนแปลงแล้ว", "** มูลค่างาน Ongoing, On Hand เป็นมูลค่าคงค้างส่งมอบ"]} />
      ),
      edit: <StatusEditor key={sel.id + "v"} id={sel.id} section="status_values" data={values} labels={labels} suggest={suggestValues} unit="ล้านบาท" />,
    },
    {
      key: "issues", title: "โครงการมีปัญหา",
      node: <IssuesSlide rows={issues} asof={sel.status_asof} />,
      edit: <IssuesEditor key={sel.id + "i"} id={sel.id} data={issues} projects={hints} />,
    },
    { key: "d2", title: "02. Project Timeline", presentOnly: true, node: <Divider n="02." t="Project Timeline" /> },
    {
      key: "timeline", title: "Project Timeline",
      node: <Timeline rows={tlRows} days={days} months={months} todayIdx={todayIdx} />,
    },
    { key: "d3", title: "03. แผนงานการจัดส่ง", presentOnly: true, node: <Divider n="03." t="แผนงานการจัดส่ง" /> },
    {
      key: "delivery", title: "แผนการจัดส่ง — ประเภทการก่อสร้าง",
      node: <DeliveryTypeSlide d={delivery} month={meetMonth} />,
      edit: <DeliveryEditor key={sel.id + "d"} id={sel.id} data={delivery} suggestPiles={suggestPiles} />,
    },
    { key: "products", title: "แผนการจัดส่ง — 5 ผลิตภัณฑ์", node: <ProductSlide d={delivery} month={meetMonth} /> },
  ];
  if (sel.notes.trim())
    slides.push({ key: "notes", title: "สรุป", node: <NotesSlide notes={sel.notes} /> });
  slides.push({ key: "end", title: "ปิด", presentOnly: true, node: (
    <div className="ps-hero">
      <Image src="/monthly/cover.jpg" alt="" fill loading="eager" sizes="(max-width: 1700px) 100vw, 1700px" className="ps-hero-img" />
      <div className="ps-hero-shade" />
      <div className="ps-hero-txt"><h2>Thank you</h2><span className="ps-hero-rule" /><div className="ps-sub">{sel.title} · {dateFull(sel.meeting_date)}</div></div>
    </div>
  ) });

  return (
    <>
      {header(
        <MonthlyPicker value={sel.meeting_date} options={list.map((m) => ({ value: m.meeting_date, label: fDate(m.meeting_date) }))} />,
      )}
      <Presenter slides={slides} docTitle={`${sel.title} ${dateFull(sel.meeting_date)}`} toolbar={<>
        <NewMeeting defaultDate={today} defaultAsof={today.slice(0, 8) + "01"} />
        <DeleteMeeting id={sel.id} label={fDate(sel.meeting_date)} />
      </>} />
    </>
  );
}

/* ================= ส่วนประกอบสไลด์ ================= */

function normType(t: string) {
  const s = t.trim().toLowerCase();
  const hit = ["Industrial", "Commercial", "Residential", "Infrastructure"].find((x) => x.toLowerCase() === s);
  return hit ?? "Other";
}

/** วันที่มีแผนติดกัน → แท่งเดียว */
function segments(pts: { d: number; q: number }[]) {
  const out: { s: number; len: number; q: number }[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.s + last.len === p.d) { last.len++; last.q += p.q; } else out.push({ s: p.d, len: 1, q: p.q });
  }
  return out;
}

function Divider({ n, t }: { n: string; t: string }) {
  return <div className="ps-divider"><span>{n}</span><h2>{t}</h2><div className="ps-co">ASIA EXPANSION CONCRETE PRODUCT (1993) CO.,LTD</div></div>;
}

function SlideHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return <div className="ps-head"><h3 className="ps-h">{title}</h3>{right && <div className="ps-head-r">{right}</div>}</div>;
}

function StatusSlide({ title, unit, data, labels, asof, digits, foot }: {
  title: string; unit: string; data: StatusData; labels: { cur: string; prev: string }; asof: string; digits: number; foot?: string[];
}) {
  const f = (n: number | null) => (n == null || n === 0 ? "" : digits ? fM2(n) : fNum(n));
  const cur = colTotals(data.cur), prev = colTotals(data.prev);
  const tc = rowTotal(cur), tp = rowTotal(prev);
  const block = (lbl: string, g: StatusData["cur"], tot: number[], all: number, isCur: boolean) => (
    <>
      {SERVICE_ROWS.map((r, k) => (
        <tr key={lbl + r.key} className={isCur ? "cur" : ""}>
          {k === 0 && <td rowSpan={5} className="ps-yr">{lbl}</td>}
          <td>{r.label}</td>
          {g[r.key].map((x, i) => <td key={i} className="num">{f(x)}</td>)}
          <td className="num b">{f(rowTotal(g[r.key]))}</td>
        </tr>
      ))}
      <tr className="total"><td>รวม</td>{tot.map((x, i) => <td key={i} className="num">{f(x) || "0"}</td>)}<td className="num">{digits ? fM2(all) : fNum(all)}</td></tr>
      <tr className="pct"><td />{tot.map((x, i) => <td key={i} className="num">{pctOf(x, all)}</td>)}<td className="num">100%</td></tr>
    </>
  );
  return (
    <div>
      <SlideHead title={title} right={<><span className="chip cur-m">ข้อมูลเดือน {labels.cur}</span><span className="chip">หน่วย: {unit}</span><span className="chip">Update {fDate(asof)}</span></>} />
      <div className="ps-tiles">
        {STATUS_COLS.map((c, i) => (
          <div className="ps-tile" key={c.key} style={{ ["--c" as string]: c.color }}>
            <div className="ps-tile-l">{c.label}</div>
            <div className="ps-tile-v">{digits ? fM2(cur[i]) : fNum(cur[i])}<small>{pctOf(cur[i], tc)}</small></div>
            <div className="ps-tile-p">{labels.cur}</div>
          </div>
        ))}
      </div>
      <div className="ps-share">
        {[[labels.cur, cur, tc], [labels.prev, prev, tp]].map(([l, t, all]) => (
          <div className="ps-share-row" key={l as string}>
            <span>{l as string}</span>
            <div className="ps-share-bar">
              {(t as number[]).map((x, i) => x > 0 && (
                <i key={i} style={{ width: `${(x / (all as number)) * 100}%`, background: STATUS_COLS[i].color }} title={`${STATUS_COLS[i].label}: ${pctOf(x, all as number)}`}>
                  {x / (all as number) >= 0.07 ? pctOf(x, all as number) : ""}
                </i>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="ps-tbl">
          <thead>
            <tr><th /><th />{STATUS_COLS.map((c) => <th key={c.key} className="num" style={{ color: c.color }}>{c.short}<span>{c.label}</span></th>)}<th className="num">รวมทั้งหมด</th></tr>
          </thead>
          <tbody>
            {block(labels.cur, data.cur, cur, tc, true)}
            {block(labels.prev, data.prev, prev, tp, false)}
          </tbody>
        </table>
      </div>
      {foot && <div className="ps-foot">{foot.map((x) => <div key={x}>{x}</div>)}</div>}
    </div>
  );
}

function IssuesSlide({ rows, asof }: { rows: Issue[]; asof: string }) {
  const sum = (f: (r: Issue) => number | null) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  return (
    <div>
      <SlideHead title="โครงการมีปัญหา" right={<><span className="chip">{rows.length} โครงการ</span><span className="chip">Update {fDate(asof)}</span></>} />
      {rows.length === 0 ? <Empty>ยังไม่มีรายการ — กด &quot;แก้รายการโครงการมีปัญหา&quot; ด้านล่าง</Empty> : (
        <div className="tbl-wrap">
          <table className="ps-tbl issues">
            <thead>
              <tr><th>รหัสโครงการ</th><th>ลูกค้า / โครงการ</th><th>ปัญหา / รายละเอียด</th><th className="num">มูลค่า<span>(ล้านบาท)</span></th><th className="num">คงค้าง<span>(ล้านบาท)</span></th><th className="num">คงเหลือ<span>(ต้น)</span></th><th>Timeline</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="code">{r.code}</td>
                  <td><b>{r.customer}</b><span className="ps-sub2">{r.project}</span></td>
                  <td>{r.issue && <span className="ps-issue">{r.issue}</span>}{r.detail && <span className="ps-sub2">{r.detail}</span>}</td>
                  <td className="num">{fM2(r.value)}</td>
                  <td className="num">{/^-?[\d.,]+$/.test(r.outstanding) ? fM2(Number(r.outstanding.replace(/,/g, ""))) : <span className="ps-sub2 wrap">{r.outstanding || "–"}</span>}</td>
                  <td className="num">{fNum(r.remain_qty)}</td>
                  <td className="nowrap">{r.timeline || "–"}</td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={3}>รวม {rows.length} โครงการ</td>
                <td className="num">{fM2(sum((r) => r.value))}</td>
                <td className="num">{fM2(sum((r) => (/^-?[\d.,]+$/.test(r.outstanding) ? Number(r.outstanding.replace(/,/g, "")) : 0)))}</td>
                <td className="num">{fNum(sum((r) => r.remain_qty))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TL_STATUS: Record<string, { label: string; cls: string }> = {
  ongoing: { label: "Ongoing", cls: "on" }, on_hand: { label: "On Hand", cls: "oh" }, hold: { label: "Hold", cls: "hd" },
};

function Timeline({ rows, days, months, todayIdx }: {
  rows: { p: ProjectRow; segs: { s: number; len: number; q: number }[] }[]; days: string[]; months: string[]; todayIdx?: number;
}) {
  const n = days.length;
  const grid = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const group = (s: string) => rows.filter((r) => r.p.status === s);
  const stat = (s: string) => {
    const g = group(s);
    return { n: g.length, qty: g.reduce((a, r) => a + r.p.remain_qty, 0), val: g.reduce((a, r) => a + r.p.value_remain, 0) };
  };
  return (
    <div>
      <SlideHead title="Project Timeline" right={<span className="chip">แผนตอกจากระบบ · {fDate(days[0])} – {fDate(days[n - 1])}</span>} />
      <div className="ps-tl-sum">
        {(["ongoing", "on_hand", "hold"] as const).map((s) => {
          const x = stat(s);
          return (
            <div key={s} className={`ps-tl-chip ${TL_STATUS[s].cls}`}>
              <b>{TL_STATUS[s].label}</b> {x.n} โครงการ · คงเหลือ {fNum(x.qty)} ต้น · {fM2(M(x.val))} ล้านบาท
            </div>
          );
        })}
      </div>
      <div className="tbl-wrap">
        <div className="gantt">
          <div className="g-row g-head">
            <div className="g-left"><span>#</span><span>รหัส</span><span>ลูกค้า / โครงการ</span><span className="num">คงเหลือ</span><span className="num">ล้านบาท</span></div>
            <div className="g-days" style={grid}>
              {months.map((m) => {
                const s = days.indexOf(m);
                const len = days.filter((d) => d.slice(0, 7) === m.slice(0, 7)).length;
                return <div key={m} className="g-month" style={{ gridColumn: `${s + 1} / span ${len}` }}>{TH_MONTHS[Number(m.slice(5, 7)) - 1]} {String(Number(m.slice(0, 4)) + 543).slice(2)}</div>;
              })}
              {days.map((d, i) => [1, 8, 15, 22, 29].includes(Number(d.slice(8, 10))) && (
                <div key={d} className="g-dnum" style={{ gridColumn: `${i + 1} / span 1` }}>{Number(d.slice(8, 10))}</div>
              ))}
            </div>
          </div>
          {rows.length === 0 && <Empty>ไม่มีแผนตอกในช่วงนี้</Empty>}
          {rows.map(({ p, segs }, i) => {
            const prevStatus = rows[i - 1]?.p.status;
            return (
              <div className={`g-row ${prevStatus && prevStatus !== p.status ? "g-split" : ""}`} key={p.code}>
                <div className="g-left">
                  <span className="muted">{i + 1}</span>
                  <span className={`g-code ${TL_STATUS[p.status]?.cls}`}>{p.code}</span>
                  <span className="g-name" title={`${p.customer_name} · ${p.project_name}`}>{p.customer_name}<small>{p.project_name}</small></span>
                  <span className="num">{fNum(p.remain_qty)}</span>
                  <span className="num">{fM2(M(p.value_remain))}</span>
                </div>
                <div className="g-days" style={grid}>
                  {months.slice(1).map((m) => <i key={m} className="g-msep" style={{ gridColumn: `${days.indexOf(m) + 1} / span 1` }} />)}
                  {todayIdx != null && <i className="g-today" style={{ gridColumn: `${todayIdx + 1} / span 1` }} />}
                  {segs.map((s) => (
                    <span key={s.s} className={`g-bar ${TL_STATUS[p.status]?.cls}`} style={{ gridColumn: `${s.s + 1} / span ${s.len}` }}
                      title={`${p.code}: ${fDate(days[s.s])} – ${fDate(days[s.s + s.len - 1])} · แผน ${fNum(s.q)} ต้น`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function deliveryKpis(d: Delivery, month: string) {
  const m3 = d.by_type.reduce((s, r) => s + (r.m3 ?? 0), 0);
  const piles = d.by_type.reduce((s, r) => s + (r.piles ?? 0), 0);
  return (
    <div className="ps-tiles k3">
      <div className="ps-tile" style={{ ["--c" as string]: "var(--s1)" }}><div className="ps-tile-l">แผนจัดส่ง {monthFull(month)}</div><div className="ps-tile-v">{fNum(m3)}<small>ลบ.ม.</small></div></div>
      <div className="ps-tile" style={{ ["--c" as string]: "var(--s3)" }}><div className="ps-tile-l">จำนวน</div><div className="ps-tile-v">{fNum(piles)}<small>ต้น</small></div></div>
      <div className="ps-tile" style={{ ["--c" as string]: "var(--s4)" }}><div className="ps-tile-l">แผนตามอัตราการใช้ (Ongoing, On Hand)</div><div className="ps-tile-v">{fNum(d.rate)}<small>ลบ.ม./วัน</small></div></div>
    </div>
  );
}

function DeliveryTypeSlide({ d, month }: { d: Delivery; month: string }) {
  const rows = d.by_type.filter((r) => r.type);
  const m3 = rows.reduce((s, r) => s + (r.m3 ?? 0), 0), piles = rows.reduce((s, r) => s + (r.piles ?? 0), 0);
  return (
    <div>
      <SlideHead title={`แผนการจัดส่ง เดือน${monthFull(month)}`} />
      {deliveryKpis(d, month)}
      <div className="tbl-wrap">
        <table className="ps-tbl">
          <thead><tr><th>ประเภทการก่อสร้าง</th><th className="num">ลบ.ม.</th><th style={{ width: "28%" }} /><th className="num">จำนวนต้น</th><th style={{ width: "28%" }} /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.type}>
                <td><b>{r.type}</b></td>
                <td className="num">{fNum(r.m3)}</td>
                <td><Bar v={r.m3 ?? 0} all={m3} color="var(--s1)" /></td>
                <td className="num">{fNum(r.piles)}</td>
                <td><Bar v={r.piles ?? 0} all={piles} color="var(--s3)" /></td>
              </tr>
            ))}
            <tr className="total"><td>Total</td><td className="num">{fNum(m3)}</td><td /><td className="num">{fNum(piles)}</td><td /></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductSlide({ d, month }: { d: Delivery; month: string }) {
  const m3All = d.by_type.reduce((s, r) => s + (r.m3 ?? 0), 0), pilesAll = d.by_type.reduce((s, r) => s + (r.piles ?? 0), 0);
  const rows = [...d.products].filter((r) => r.product).sort((a, b) => (b.m3 ?? 0) - (a.m3 ?? 0));
  return (
    <div>
      <SlideHead title={`${rows.length || 5} ผลิตภัณฑ์ที่มีแผนจัดส่งมากที่สุด`} right={<span className="chip">เดือน{monthFull(month)}</span>} />
      {deliveryKpis(d, month)}
      {rows.length === 0 ? <Empty>ยังไม่มีข้อมูล — กรอกในหัวข้อ &quot;แผนการจัดส่ง&quot;</Empty> : (
        <div className="tbl-wrap">
          <table className="ps-tbl">
            <thead><tr><th>ผลิตภัณฑ์</th><th className="num">ลบ.ม.</th><th style={{ width: "20%" }} /><th className="num">จำนวนต้น</th><th style={{ width: "20%" }} /><th>โครงการ</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product}>
                  <td><b className="ps-prod">{r.product}</b></td>
                  <td className="num">{fNum(r.m3)}</td>
                  <td><Bar v={r.m3 ?? 0} all={m3All} color="var(--s1)" /></td>
                  <td className="num">{fNum(r.piles)}</td>
                  <td><Bar v={r.piles ?? 0} all={pilesAll} color="var(--s3)" /></td>
                  <td className="ps-sub2 wrap">{r.projects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Bar({ v, all, color }: { v: number; all: number; color: string }) {
  const p = all ? (v / all) * 100 : 0;
  return <div className="ps-bar"><i style={{ width: `${p}%`, background: color }} /><span>{all ? `${Math.round(p)}%` : ""}</span></div>;
}

function NotesSlide({ notes }: { notes: string }) {
  return (
    <div>
      <SlideHead title="สรุป / สิ่งที่ขอให้ที่ประชุมรับทราบ" />
      <ol className="ps-notes">{notes.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ol>
    </div>
  );
}
