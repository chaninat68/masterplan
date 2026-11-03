import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { fDate, fMonth, fNum } from "@/lib/format";
import { addMonths, CATEGORY_LABEL, fM, forecast } from "@/lib/salesMeeting";
import { CardHead, Empty, Kpi, PageHeader } from "@/components/ui";
import { InlineEdit } from "@/components/InlineEdit";
import { SalesTarget } from "@/components/charts";
import { updatePipeline } from "./actions";
import { AddItem, DeleteItem, MeetingPicker } from "./MeetingControls";

export const metadata: Metadata = { title: "ประชุมแผนกขาย" };

type Meeting = { id: string; meeting_date: string; period_month: string; title: string; week_labels: string[]; remain_label: string };
type Person = { salesperson: string; sort: number; target: number; weeks: number[] };
type ProductMonth = { product: string; month: string; actual: number | null; target: number | null };
type Item = {
  id: number; salesperson: string; product: string; first_quote: string | null; last_quote: string | null; customer: string;
  project: string; value: number; category: string; expected_month: string | null; expected_text: string; status_note: string;
  start_date: string | null; duration: string;
};

const TABS = [
  { key: "active", label: "Base + Best", cats: ["base", "best"] },
  { key: "base", label: "Base", cats: ["base"] },
  { key: "best", label: "Best", cats: ["best"] },
  { key: "lost", label: "ไม่ได้งาน", cats: ["lost"] },
  { key: "excluded", label: "ไม่บวกเข้ายอด", cats: ["excluded", "cancelled"] },
  { key: "all", label: "ทั้งหมด", cats: [] as string[] },
];
const PRODUCTS = ["IP", "HC", "PC"];
const ITEM_COLS = "id, salesperson, product, first_quote, last_quote, customer, project, value, category, expected_month, expected_text, status_note, start_date, duration";
const num = (v: unknown) => Number(v ?? 0);
const keyOf = (x: { salesperson: string; customer: string; project: string }) => `${x.salesperson}|${x.customer}|${x.project}`.replace(/\s+/g, "");
const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);

export default async function MeetingPage(props: PageProps<"/meeting">) {
  const user = await requirePage("meeting");
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data: meetings } = await supabase.from("sales_meetings").select("id, meeting_date, period_month, title, week_labels, remain_label").order("meeting_date", { ascending: false });
  const list = (meetings ?? []) as Meeting[];
  const header = (right?: React.ReactNode) => (
    <PageHeader title="ประชุมแผนกขายประจำสัปดาห์" sub="สรุปยอดขายรายสัปดาห์ เทียบเป้า และงานที่คาดว่าจะได้ (Base / Best) · หน่วย: ล้านบาท" readOnly={!user.canEdit} right={right} />
  );
  if (!list.length)
    return <>{header()}<div className="card"><Empty>ยังไม่มีข้อมูลประชุม — {user.canEdit ? <Link className="link" href="/import">นำเข้าไฟล์ Sales Update</Link> : "รอส่วนงานวางแผนนำเข้าไฟล์ Sales Update"}</Empty></div></>;

  const sel = list.find((m) => m.meeting_date === sp.m) ?? list[0];
  const prev = list.find((m) => m.meeting_date < sel.meeting_date);
  const latest = sel.id === list[0].id;
  const canEdit = user.canEdit && latest; // ประชุมครั้งก่อนๆ = ประวัติ ดูอย่างเดียว

  const [peopleRes, prodRes, items, prevItems, prevPeopleRes] = await Promise.all([
    supabase.from("sales_meeting_people").select("salesperson, sort, target, weeks").eq("meeting_id", sel.id).order("sort"),
    supabase.from("sales_product_months").select("product, month, actual, target").eq("meeting_id", sel.id),
    fetchAll<Item>((a, b) => supabase.from("sales_pipeline").select(ITEM_COLS).eq("meeting_id", sel.id).order("id").range(a, b)),
    prev ? fetchAll<Item>((a, b) => supabase.from("sales_pipeline").select(ITEM_COLS).eq("meeting_id", prev.id).order("id").range(a, b)) : Promise.resolve([] as Item[]),
    prev ? supabase.from("sales_meeting_people").select("salesperson, sort, target, weeks").eq("meeting_id", prev.id) : Promise.resolve({ data: [] as Person[] }),
  ]);
  const people = ((peopleRes.data ?? []) as Person[]).map((p) => ({ ...p, target: num(p.target), weeks: (p.weeks ?? []).map(num) }));
  const products = ((prodRes.data ?? []) as ProductMonth[]).map((p) => ({ ...p, actual: p.actual == null ? null : num(p.actual), target: p.target == null ? null : num(p.target) }));
  const pipeline = items.map((x) => ({ ...x, value: num(x.value) }));

  const period = sel.period_month;
  const months = [0, 1, 2].map((k) => addMonths(period, k));
  const mLabel = (m: string) => fMonth(m.slice(0, 7));
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

  // สรุปรายเซลล์
  const rows = people.map((p) => {
    const mtd = sum(p.weeks);
    return { ...p, mtd, fc: forecast(pipeline.filter((x) => x.salesperson === p.salesperson), period, mtd) };
  });
  const tMtd = sum(rows.map((r) => r.mtd)), tTarget = sum(rows.map((r) => r.target));
  const tFc = forecast(pipeline, period, tMtd);
  const weekCount = Math.max(sel.week_labels.length, ...people.map((p) => p.weeks.length));
  const prevMtd = prev && prev.period_month === period ? sum(((prevPeopleRes.data ?? []) as Person[]).flatMap((p) => (p.weeks ?? []).map(num))) : null;

  // ตามผลิตภัณฑ์ / รายเดือน
  const year = period.slice(0, 4);
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  const pm = (prod: string, m: string) => products.find((x) => x.product === prod && x.month === m);
  const prodList = [...new Set([...PRODUCTS, ...products.map((x) => x.product)])].filter((p) => products.some((x) => x.product === p));
  const actualOf = (m: string) => (m <= period ? sum(products.filter((x) => x.month === m).map((x) => x.actual ?? 0)) : null);
  const targetOf = (m: string) => { const t = products.filter((x) => x.month === m && x.target != null); return t.length ? sum(t.map((x) => x.target!)) : null; };
  const chartMonths = [...new Set([...yearMonths, ...months])].sort();
  const chart = chartMonths.map((m) => {
    const k = months.indexOf(m), f = tFc[k];
    const act = m < period ? actualOf(m) : m === period ? tMtd : null;
    return {
      label: mLabel(m),
      actual: act == null ? null : act / 1e6,
      base: f ? (f.base - (k === 0 ? tMtd : 0)) / 1e6 : null,
      best: f ? (f.best - f.base) / 1e6 : null,
      target: targetOf(m) == null ? null : targetOf(m)! / 1e6,
    };
  });
  const ytd = sum(yearMonths.filter((m) => m <= period).map((m) => actualOf(m) ?? 0));
  const ytdTarget = sum(yearMonths.filter((m) => m <= period).map((m) => targetOf(m) ?? 0));
  const yearTarget = sum(yearMonths.map((m) => targetOf(m) ?? 0));
  const periodTarget = targetOf(period);

  // รายการงาน + เทียบประชุมครั้งก่อน
  const prevMap = new Map(prevItems.map((x) => [keyOf(x), x]));
  const curKeys = new Set(pipeline.map(keyOf));
  const change = (x: Item): { t: string; c: string } | null => {
    if (!prev) return null;
    const o = prevMap.get(keyOf(x));
    if (!o) return { t: "ใหม่", c: "g" };
    if (o.category !== x.category) return { t: `${CATEGORY_LABEL[o.category]} → ${CATEGORY_LABEL[x.category]}`, c: x.category === "lost" ? "r" : x.category === "base" ? "g" : "a" };
    if (o.expected_month !== x.expected_month) return { t: `เลื่อนจาก ${o.expected_month ? mLabel(o.expected_month) : "ไม่ระบุ"}`, c: "a" };
    if (Math.abs(num(o.value) - x.value) >= 1) return { t: `มูลค่าเดิม ${fM(num(o.value))}`, c: "n" };
    return null;
  };
  const changes = pipeline.map((x) => ({ x, ch: change(x) })).filter((r) => r.ch);
  const gone = prev ? prevItems.filter((o) => !curKeys.has(keyOf(o)) && (o.category === "base" || o.category === "best")) : [];
  const countCh = (f: (t: string) => boolean) => changes.filter((r) => f(r.ch!.t));

  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const who = typeof sp.p === "string" ? sp.p : "";
  const shown = pipeline
    .filter((x) => !tab.cats.length || tab.cats.includes(x.category))
    .filter((x) => !who || x.salesperson === who)
    .sort((a, b) => (a.expected_month ?? "9999").localeCompare(b.expected_month ?? "9999") || b.value - a.value);
  const tabCount = (cats: string[]) => pipeline.filter((x) => (!cats.length || cats.includes(x.category)) && (!who || x.salesperson === who)).length;
  const qs = (o: Record<string, string>) => {
    const q = new URLSearchParams({ m: sel.meeting_date, tab: tab.key, ...(who ? { p: who } : {}), ...o });
    if (!q.get("p")) q.delete("p");
    return `/meeting?${q}`;
  };
  const monthOpts = Array.from({ length: 15 }, (_, i) => addMonths(period, i - 2)).map((m) => ({ value: m, label: mLabel(m) }));
  const catOpts = (["base", "best", "lost", "excluded", "cancelled", ""] as const).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
  const salesNames = [...new Set([...people.map((p) => p.salesperson), ...pipeline.map((x) => x.salesperson)].filter(Boolean))];

  // สาเหตุที่ไม่ได้งาน
  const lostBy = new Map<string, { n: number; v: number }>();
  for (const x of pipeline.filter((x) => x.category === "lost")) {
    const k = x.status_note || "ไม่ระบุ";
    const o = lostBy.get(k) ?? { n: 0, v: 0 };
    o.n++; o.v += x.value;
    lostBy.set(k, o);
  }
  const lost = [...lostBy.entries()].sort((a, b) => b[1].v - a[1].v);

  return (
    <>
      {header(<MeetingPicker value={sel.meeting_date} options={list.map((m) => ({ value: m.meeting_date, label: `${fDate(m.meeting_date)}${m.id === list[0].id ? " (ล่าสุด)" : ""}` }))} />)}
      {!latest && <div className="banner" style={{ background: "var(--warn-soft)" }}>กำลังดูประชุมย้อนหลัง {fDate(sel.meeting_date)} — ดูอย่างเดียว · <Link className="link" href="/meeting">ไปประชุมล่าสุด</Link></div>}

      <div className="grid g4 mb">
        <Kpi tone="blue" icon="money" label={`ยอดขาย ${mLabel(period)} (ถึง ${fDate(sel.meeting_date)})`} value={fM(tMtd)} unit="ล้าน"
          cmp={<div className="cmp">{fNum(pct(tMtd, tTarget), 0)}% ของเป้า {fM(tTarget)} ล้าน{prevMtd != null && <> · <span className={tMtd >= prevMtd ? "up" : "down"}>+{fM(tMtd - prevMtd)}</span> จากครั้งก่อน</>}</div>} />
        <Kpi tone="green" icon="trend" label={`ประมาณการสิ้นเดือน ${mLabel(period)}`} value={fM(tFc[0].base)} unit="ล้าน (Base)"
          cmp={<div className="cmp">Best {fM(tFc[0].best)} ล้าน · {fNum(pct(tFc[0].base, tTarget), 0)}% ของเป้า</div>} />
        <Kpi tone="amber" icon="cal" label={`ประมาณการ ${mLabel(months[1])}`} value={fM(tFc[1].base)} unit="ล้าน (Base)"
          cmp={<div className="cmp">Best {fM(tFc[1].best)} ล้าน{targetOf(months[1]) != null && <> · เป้า {fM(targetOf(months[1]))}</>}</div>} />
        <Kpi tone="blue" icon="doc" label={`ยอดขายสะสมปี ${Number(year) + 543}`} value={fM(ytd)} unit="ล้าน"
          cmp={<div className="cmp">{fNum(pct(ytd, ytdTarget), 0)}% ของเป้าสะสม {fM(ytdTarget)} · เป้าทั้งปี {fM(yearTarget)}</div>} />
      </div>

      <div className="card mb">
        <CardHead title={sel.title || `สรุปยอดขาย ${mLabel(period)}`} sub={`ยอดขายรายสัปดาห์ต่อเซลล์ และประมาณการ — Base = ยอดขาย + งาน Base · Best = Base + งาน Best${periodTarget != null ? ` · เป้าบริษัทเดือนนี้ ${fM(periodTarget)} ล้าน` : ""}`} />
        <div className="tbl-wrap">
          <table className="mtbl">
            <thead>
              <tr>
                <th rowSpan={2}>พนักงาน</th><th rowSpan={2} className="num">เป้า</th>
                <th colSpan={weekCount} className="grp">ยอดขายรายสัปดาห์</th>
                <th rowSpan={2} className="num">ยอดขาย<br />เดือนนี้</th><th rowSpan={2}>% เป้า</th>
                {months.map((m) => <th key={m} colSpan={2} className="grp">ประมาณการ {mLabel(m)}</th>)}
              </tr>
              <tr>
                {Array.from({ length: weekCount }, (_, i) => <th key={i} className="num">ส.{i + 1}<span className="th-sub">{sel.week_labels[i] ?? ""}</span></th>)}
                {months.map((m) => [<th key={m + "b"} className="num">Base</th>, <th key={m + "t"} className="num best">Best</th>])}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.salesperson}>
                  <td className="nowrap"><Link className="code" href={qs({ p: r.salesperson, tab: "active" }) + "#pipeline"}>{r.salesperson}</Link></td>
                  <td className="num muted">{r.target ? fM(r.target) : "–"}</td>
                  {Array.from({ length: weekCount }, (_, i) => <td key={i} className="num">{r.weeks[i] ? fM(r.weeks[i]) : <span className="muted">–</span>}</td>)}
                  <td className="num"><b>{fM(r.mtd)}</b></td>
                  <td>{r.target ? <Pct a={r.mtd} b={r.target} /> : <span className="muted">–</span>}</td>
                  {r.fc.map((f) => [<td key={f.month + "b"} className="num">{f.base ? fM(f.base) : <span className="muted">–</span>}</td>, <td key={f.month + "t"} className="num best">{f.best ? fM(f.best) : <span className="muted">–</span>}</td>])}
                </tr>
              ))}
              <tr className="total">
                <td>รวม</td><td className="num">{fM(tTarget)}</td>
                {Array.from({ length: weekCount }, (_, i) => <td key={i} className="num">{fM(sum(rows.map((r) => r.weeks[i] ?? 0)))}</td>)}
                <td className="num">{fM(tMtd)}</td><td><Pct a={tMtd} b={tTarget} /></td>
                {tFc.map((f) => [<td key={f.month + "b"} className="num">{fM(f.base)}</td>, <td key={f.month + "t"} className="num best">{fM(f.best)}</td>])}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g64 mb">
        <div className="card">
          <CardHead title={`ยอดขายเทียบเป้า ปี ${Number(year) + 543}`} sub="ล้านบาท · แท่งทึบ = ยอดขายจริง · จาง = ประมาณการ Base · เส้นประ = เพิ่มถ้าได้ Best" />
          <div className="legend"><span><i style={{ background: "var(--s1)" }} />ยอดขายจริง</span><span><i style={{ background: "color-mix(in srgb,var(--s1) 45%,transparent)" }} />Base</span><span><i style={{ background: "color-mix(in srgb,var(--s1) 18%,transparent)" }} />Best</span><span><i className="line" style={{ background: "var(--warn)" }} />เป้า</span></div>
          <div className="chart-box"><SalesTarget data={chart} /></div>
        </div>
        <div className="card">
          <CardHead title="ยอดขายตามผลิตภัณฑ์" sub={`ม.ค. – ${mLabel(period)} · ล้านบาท`} />
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>ผลิตภัณฑ์</th><th className="num">{mLabel(period)}</th><th className="num">สะสมปีนี้</th><th className="num">เป้าสะสม</th><th>% เป้า</th></tr></thead>
              <tbody>
                {prodList.map((p) => {
                  const a = sum(yearMonths.filter((m) => m <= period).map((m) => pm(p, m)?.actual ?? 0));
                  const t = sum(yearMonths.filter((m) => m <= period).map((m) => pm(p, m)?.target ?? 0));
                  return <tr key={p}><td><b>{p}</b></td><td className="num">{fM(pm(p, period)?.actual ?? 0)}</td><td className="num"><b>{fM(a)}</b></td><td className="num muted">{t ? fM(t) : "–"}</td><td>{t ? <Pct a={a} b={t} /> : null}</td></tr>;
                })}
                <tr className="total"><td>รวม</td><td className="num">{fM(actualOf(period))}</td><td className="num">{fM(ytd)}</td><td className="num">{fM(ytdTarget)}</td><td><Pct a={ytd} b={ytdTarget} /></td></tr>
              </tbody>
            </table>
          </div>
          <div className="sub" style={{ marginTop: 10 }}>เฉลี่ยต่อเดือน {fM(ytd / Math.max(1, Number(period.slice(5, 7))))} ล้าน · เป้าทั้งปี {fM(yearTarget)} ล้าน</div>
        </div>
      </div>

      {prev && (
        <div className="grid g64 mb">
          <div className="card">
            <CardHead title="เปลี่ยนแปลงจากประชุมครั้งก่อน" sub={`เทียบกับ ${fDate(prev.meeting_date)}`} />
            <div className="minis m5">
              <div><b>{countCh((t) => t === "ใหม่").length}</b>รายการใหม่ · {fM(sum(countCh((t) => t === "ใหม่").map((r) => r.x.value)))} ล้าน</div>
              <div><b>{countCh((t) => t.endsWith("→ Base")).length}</b>ขยับเป็น Base</div>
              <div><b>{countCh((t) => t.endsWith("→ ไม่ได้งาน")).length}</b>เปลี่ยนเป็นไม่ได้งาน</div>
              <div><b>{countCh((t) => t.startsWith("เลื่อนจาก")).length}</b>เลื่อนเดือน</div>
              <div><b>{gone.length}</b>Base/Best ที่หายไป (ได้ SO แล้ว?)</div>
            </div>
            {gone.length > 0 && <div className="sub" style={{ marginTop: 10 }}>หายไปจากรายการ: {gone.slice(0, 8).map((o) => `${o.project} (${fM(num(o.value))})`).join(" · ")}{gone.length > 8 ? " …" : ""}</div>}
          </div>
          <LostCard lost={lost} />
        </div>
      )}
      {!prev && <div className="mb"><LostCard lost={lost} /></div>}

      <div className="card" id="pipeline">
        <CardHead title="รายการงานที่คาดว่าจะได้" sub={`${shown.length} รายการ · มูลค่ารวม ${fM(sum(shown.map((x) => x.value)))} ล้าน${canEdit ? " · คลิกช่องประเภท / เดือน / มูลค่า / สถานะ เพื่อแก้" : ""}`} />
        <div className="toolbar">
          <div className="seg">
            {TABS.map((t) => <Link key={t.key} href={qs({ tab: t.key }) + "#pipeline"} className={t.key === tab.key ? "on" : ""} scroll={false}>{t.label}<span className="n">{tabCount(t.cats)}</span></Link>)}
          </div>
          <div className="seg">
            <Link href={qs({ p: "" }) + "#pipeline"} className={!who ? "on" : ""} scroll={false}>ทุกคน</Link>
            {salesNames.map((n) => <Link key={n} href={qs({ p: n }) + "#pipeline"} className={who === n ? "on" : ""} scroll={false}>{n.replace(/^คุณ/, "")}</Link>)}
          </div>
          <div className="grow" />
          {canEdit && <AddItem meetingId={sel.id} people={salesNames} months={monthOpts.slice(2)} />}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>เซลล์</th><th>ลูกค้า / โครงการ</th><th>ผลิตภัณฑ์</th><th className="num">มูลค่า (ล้าน)</th><th>ประเภท</th><th>เดือนที่คาดว่าจะได้</th><th>สถานะปัจจุบัน</th><th>เริ่มงาน</th><th>เสนอราคาล่าสุด</th>{prev && <th>เทียบครั้งก่อน</th>}{canEdit && <th />}</tr></thead>
            <tbody>
              {shown.map((x) => {
                const ch = change(x);
                return (
                  <tr key={x.id}>
                    <td className="nowrap">{x.salesperson.replace(/^คุณ/, "") || <span className="muted">–</span>}</td>
                    <td><span className="cell-sub" style={{ color: "var(--ink)", maxWidth: 320 }}><InlineEdit canEdit={canEdit} value={x.project} onSave={updatePipeline.bind(null, x.id, "project")} /></span><span className="cell-sub" style={{ maxWidth: 320 }}><InlineEdit canEdit={canEdit} value={x.customer} placeholder="+ ลูกค้า" onSave={updatePipeline.bind(null, x.id, "customer")} /></span></td>
                    <td>{x.product}</td>
                    <td className="num"><InlineEdit canEdit={canEdit} type="number" width={80} value={(x.value / 1e6).toFixed(2)} display={<b>{fM(x.value)}</b>} onSave={updatePipeline.bind(null, x.id, "value")} /></td>
                    <td><InlineEdit canEdit={canEdit} type="select" value={x.category} options={catOpts} display={<span className={`cat cat-${x.category || "none"}`}>{CATEGORY_LABEL[x.category]}</span>} onSave={updatePipeline.bind(null, x.id, "category")} /></td>
                    <td className="nowrap"><InlineEdit canEdit={canEdit} type="select" value={x.expected_month ?? ""} options={[{ value: "", label: "ไม่ระบุ" }, ...monthOpts]}
                      display={x.expected_month ? <span className={x.expected_month < period ? "wk" : ""}>{mLabel(x.expected_month)}</span> : <span className="muted">{x.expected_text || "–"}</span>} onSave={updatePipeline.bind(null, x.id, "expected_month")} /></td>
                    <td><span className="cell-sub" style={{ color: "var(--ink-2)", maxWidth: 260, whiteSpace: "normal" }}><InlineEdit canEdit={canEdit} value={x.status_note} placeholder="+ สถานะ" onSave={updatePipeline.bind(null, x.id, "status_note")} /></span></td>
                    <td className="nowrap">{fDate(x.start_date)}{x.duration && <span className="cell-sub">{x.duration}</span>}</td>
                    <td className="nowrap">{fDate(x.last_quote ?? x.first_quote)}</td>
                    {prev && <td>{ch && <span className={`dc ${ch.c}`}>{ch.t}</span>}</td>}
                    {canEdit && <td><DeleteItem id={x.id} label={x.project} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!shown.length && <Empty>ไม่มีรายการ</Empty>}
      </div>
    </>
  );
}

/** แถบ % เทียบเป้า */
function Pct({ a, b }: { a: number; b: number }) {
  const v = pct(a, b);
  if (v == null) return <span className="muted">–</span>;
  return <div className="prog sm"><div className="bar"><i style={{ width: `${Math.min(100, v).toFixed(1)}%`, background: v >= 100 ? "var(--good)" : v >= 70 ? "var(--s1)" : "var(--warn)" }} /></div><span>{fNum(v)}%</span></div>;
}

function LostCard({ lost }: { lost: [string, { n: number; v: number }][] }) {
  return (
    <div className="card">
      <CardHead title="สาเหตุที่ไม่ได้งาน" sub={`${lost.reduce((s, [, o]) => s + o.n, 0)} รายการ · ${fM(lost.reduce((s, [, o]) => s + o.v, 0))} ล้าน`} />
      {lost.length ? (
        <div className="list">
          {lost.slice(0, 6).map(([k, o]) => (
            <div key={k} className="li"><div className="t"><b>{k}</b><span>{o.n} รายการ</span></div><span className="dc r">{fM(o.v)} ล้าน</span></div>
          ))}
        </div>
      ) : <Empty>ไม่มีรายการไม่ได้งาน</Empty>}
    </div>
  );
}
