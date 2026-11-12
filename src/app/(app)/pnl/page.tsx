import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { avgPct, type Lines, PNL_LINES, pctOf, revenueOf, sumLines, yearOf } from "@/lib/pnl";
import { CardHead, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ImportPanel } from "../import/ImportPanel";
import { CostDonut, NetBars, YearArea } from "./PnlCharts";
import { type PnlRow, ProjectTable } from "./ProjectTable";

export const metadata: Metadata = { title: "Profit and Loss" };

const M = (n: number | null | undefined) => (n == null ? "–" : (n / 1e6).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const P = (n: number | null | undefined) => (n == null ? "–" : `${(n * 100).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const ratio = (a: number | undefined, b: number | undefined) => (b ? (a ?? 0) / b : null);
const yLabel = (y: string) => (/^\d+$/.test(y) ? `ปี ${y}` : y);

type Report = { id: string; file_name: string; params: { name: string; value: number }[]; created_at: string };

export default async function PnlPage() {
  const user = await requirePage("pnl");
  const supabase = await createClient();
  const { data: report } = await supabase.from("pnl_reports").select("id, file_name, params, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle<Report>();
  const rows = report
    ? await fetchAll<PnlRow>((a, b) => supabase.from("pnl_projects")
      .select("sort, project_code, ref_text, customer, project, location, product, distance, piles, volume, trips, lines")
      .eq("report_id", report.id).order("sort").range(a, b))
    : [];
  // มูลค่าโครงการจาก Master Planning (รวม VAT) — อ่านผ่าน v_project_money (RLS = can_see_sales)
  const codes = [...new Set(rows.map((r) => r.project_code).filter((c): c is string => !!c))];
  const { data: money } = codes.length
    ? await supabase.from("v_project_money").select("code, contract_value").in("code", codes)
    : { data: [] as { code: string; contract_value: number | null }[] };
  const cv = new Map((money ?? []).map((m) => [m.code, m.contract_value == null ? null : Number(m.contract_value)]));
  rows.forEach((r) => {
    for (const k of ["distance", "piles", "volume", "trips"] as const) r[k] = r[k] == null ? null : Number(r[k]);
    r.contract_value = (r.project_code && cv.get(r.project_code)) || null;
  });

  const importBox = user.canEdit && (
    <details className="pnl-import" open={!report}>
      <summary className="btn pnl-btn"><Icon name="up" />นำเข้าไฟล์ Profit and Loss</summary>
      <div className="pnl-import-body"><ImportPanel only="pnl" /></div>
    </details>
  );

  if (!report || !rows.length) {
    return (
      <div className="pnl">
        <PageHeader title="Profit and Loss" sub="กำไรขาดทุนรายโครงการ" readOnly={!user.canEdit} />
        {importBox}
        <div className="card"><Empty>ยังไม่มีข้อมูล — {user.canEdit ? "นำเข้าไฟล์ Profit and Loss.xlsx ด้านบน" : "รอส่วนงานวางแผนนำเข้าไฟล์ Profit and Loss"}</Empty></div>
      </div>
    );
  }

  const t = sumLines(rows.map((r) => r.lines));
  const avg = avgPct(rows.map((r) => r.lines));
  const revenue = revenueOf(t);
  const loss = rows.filter((r) => (r.lines.net ?? 0) < 0);
  const piles = rows.reduce((s, r) => s + (r.piles ?? 0), 0);
  const cvSum = rows.reduce((s, r) => s + (r.contract_value ?? 0), 0);
  const cvCount = rows.filter((r) => r.contract_value != null).length;

  // ปีของโครงการ (จากรหัส) เรียงเก่า→ใหม่
  const years = [...new Set(rows.map((r) => yearOf(r.project_code) || "อื่นๆ"))].sort((a, b) => (a === "อื่นๆ" ? 1 : b === "อื่นๆ" ? -1 : a.localeCompare(b)));
  const byYear = years.map((y) => {
    const list = rows.filter((r) => (yearOf(r.project_code) || "อื่นๆ") === y);
    return { year: y, count: list.length, loss: list.filter((r) => (r.lines.net ?? 0) < 0).length, lines: sumLines(list.map((r) => r.lines)) };
  });
  const chartYears = byYear.filter((y) => y.year !== "อื่นๆ");
  const series = (f: (l: Lines) => number | null) => chartYears.map((y) => ({ label: yLabel(y.year), value: f(y.lines) ?? 0 }));
  const best = (f: (l: Lines) => number | undefined) => rows.reduce<PnlRow | null>((b, r) => (b == null || (f(r.lines) ?? -Infinity) > (f(b.lines) ?? -Infinity) ? r : b), null);
  const nameOf = (r: PnlRow | null) => (r ? r.project || r.customer : "–");

  const sections = [
    {
      id: "prod", title: "ผลิตเสาเข็ม", icon: "factory", tone: "teal", color: "var(--p-teal)",
      headline: t.prod_profit, pct: ratio(t.prod_profit, t.sale), pctLabel: "ของราคาขาย",
      rows: [["ราคาขายเสาเข็ม", t.sale], ["ต้นทุนผลิต", t.prod_cost], ["OH ผลิต", t.oh_prod]] as [string, number | undefined][],
      data: series((l) => ratio(l.prod_profit, l.sale)), top: nameOf(best((l) => l.prod_profit)), topLabel: "กำไรผลิตสูงสุด",
    },
    {
      id: "drive", title: "งานตอก", icon: "crane", tone: "orange", color: "var(--p-orange)",
      headline: t.drive_profit, pct: ratio(t.drive_profit, t.drive_price), pctLabel: "ของราคาค่าตอก",
      rows: [["ราคาค่าตอก", t.drive_price], ["ต้นทุนตอก", t.drive_cost], ["OH ตอก", t.oh_drive]] as [string, number | undefined][],
      data: series((l) => ratio(l.drive_profit, l.drive_price)), top: nameOf(best((l) => l.drive_profit)), topLabel: "กำไรตอกสูงสุด",
    },
    {
      id: "transport", title: "ขนส่ง + รถร่วม", icon: "truck", tone: "aqua", color: "var(--p-aqua)",
      headline: t.transport, pct: ratio(t.transport, t.sale), pctLabel: "ต้นทุนเทียบราคาขาย", cost: true,
      rows: [["ค่าเที่ยว", t.trip], ["ค่าน้ำมัน", t.fuel], ["ค่ายาง + ค่าซ่อม + OH ขนส่ง", (t.tire ?? 0) + (t.repair ?? 0) + (t.oh_transport ?? 0)]] as [string, number | undefined][],
      data: series((l) => ratio(l.transport, l.sale)), top: nameOf(best((l) => l.transport)), topLabel: "ค่าขนส่งสูงสุด",
    },
  ];

  const kpis = [
    { label: "รายได้รวม", value: M(revenue), unit: "ล้าน", icon: "coin", tone: "teal", sub: <>ขาย {M(t.sale)} · ตอก {M(t.drive_price)} · บริการ {M(t.svc_price)}<br />มูลค่าโครงการ ก่อน VAT {M(cvSum / 1.07)} ล้าน ({cvCount}/{rows.length} โครงการที่มีใน Master Planning)</> },
    { label: "กำไรขั้นต้น (Gross Profit)", value: M(t.gross), unit: "ล้าน", icon: "trend", tone: "orange", sub: <><b className="up">{P(ratio(t.gross, t.sale))}</b> ของราคาขายเสาเข็ม</> },
    { label: "กำไรจากการดำเนินงาน", value: M(t.operating), unit: "ล้าน", icon: "pie", tone: "teal", sub: <><b className="up">{P(ratio(t.operating, revenue))}</b> ของรายได้รวม</> },
    { label: "กำไรสุทธิ (Net Profit)", value: M(t.net), unit: "ล้าน", icon: "money", tone: "orange", sub: <><b className={(t.net ?? 0) >= 0 ? "up" : "down"}>{P(ratio(t.net, revenue))}</b> · ขาดทุน {loss.length} จาก {rows.length} โครงการ</> },
  ];

  // รายได้ 100 บาท ไปไหน
  const other = (t.damaged ?? 0) + (t.footing ?? 0);
  const donut = [
    { name: "ต้นทุนผลิต", value: t.prod_cost ?? 0, color: "var(--p-teal)" },
    { name: "ต้นทุนตอก", value: t.drive_cost ?? 0, color: "var(--p-orange)" },
    { name: "ขนส่ง + รถร่วม", value: t.transport ?? 0, color: "var(--p-aqua)" },
    { name: "OH ผลิต / ตอก / บริหาร", value: (t.oh_prod ?? 0) + (t.oh_drive ?? 0) + (t.oh_admin ?? 0), color: "var(--p-sand)" },
    { name: "ค่าบริการ + เสาเสียหาย + ขยายฐานราก", value: (t.svc_cost ?? 0) + other, color: "var(--line-2)" },
    { name: "กำไรสุทธิ", value: Math.max(0, t.net ?? 0), color: "var(--p-orange-2)" },
  ].filter((d) => d.value > 0);

  const net = rows.map((r) => ({ name: `${r.ref_text || r.customer} ${r.project}`, value: ratio(r.lines.net, revenueOf(r.lines)) ?? 0, amount: r.lines.net ?? 0 })).sort((a, b) => b.value - a.value);
  const worst = [...rows].sort((a, b) => (a.lines.net ?? 0) - (b.lines.net ?? 0)).slice(0, 5).filter((r) => (r.lines.net ?? 0) < 0);
  const top = [...rows].sort((a, b) => (b.lines.net ?? 0) - (a.lines.net ?? 0)).slice(0, 5);
  const imported = new Date(report.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="pnl">
      <PageHeader
        title="Profit and Loss"
        sub={<>กำไรขาดทุนรายโครงการ {rows.length} โครงการ · {piles.toLocaleString("th-TH")} ต้น</>}
        readOnly={!user.canEdit}
        right={<span className="chip"><Icon name="doc" size={16} />{report.file_name} · นำเข้า {imported}</span>}
      />
      {importBox}

      <div className="card pnl-kpis mb">
        {kpis.map((k) => (
          <div key={k.label} className="pnl-kpi">
            <div className={`pnl-ic ${k.tone}`}><Icon name={k.icon} /></div>
            <div>
              <div className="lbl">{k.label}</div>
              <div className="val">{k.value}<small>{k.unit}</small></div>
              <div className="cmp">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid g3 mb">
        {sections.map((s) => (
          <div key={s.id} className={`card pnl-sec ${s.tone}`}>
            <div className="pnl-sec-h">
              <div className={`pnl-ic sm ${s.tone}`}><Icon name={s.icon} /></div>
              <b>{s.title}</b>
              <a href="#projects" className="link">ดูรายโครงการ →</a>
            </div>
            <div className="lbl">{s.cost ? "ต้นทุนรวม" : "กำไร (ขาดทุน)"}</div>
            <div className="big">
              {M(s.headline)}<small>ล้าน</small>
              <span className={`pill ${s.cost ? "c" : (s.pct ?? 0) >= 0 ? "g" : "r"}`}>{P(s.pct)}</span>
            </div>
            <div className="sub">{s.pctLabel} · แยกตามปีโครงการ</div>
            <div className="pnl-mini"><YearArea data={s.data} color={s.color} id={s.id} /></div>
            <div className="pnl-rows">
              {s.rows.map(([label, v]) => (
                <div key={label}><span>{label}</span><b>{M(v)}</b></div>
              ))}
            </div>
            <div className="pnl-top"><span>{s.topLabel}</span><b className={s.tone}>{s.top}</b></div>
          </div>
        ))}
      </div>

      <div className="grid g64 mb">
        <div className="card">
          <CardHead title="กำไรสุทธิรายโครงการ (% ของรายได้)" sub={`เรียงมากไปน้อย · กำไร ${rows.length - loss.length} โครงการ · ขาดทุน ${loss.length} โครงการ`} />
          <div style={{ height: 250 }}><NetBars data={net} /></div>
          <div className="pnl-legend"><span><i className="teal" />กำไร</span><span><i className="orange" />ขาดทุน</span></div>
          <div className="grid pnl-rank">
            <div>
              <div className="lbl">กำไรสุทธิสูงสุด</div>
              {top.map((r) => <div key={r.sort} className="rk"><span>{r.ref_text || r.customer} · {r.project}</span><b className="pos">{M(r.lines.net)}</b></div>)}
            </div>
            <div>
              <div className="lbl">ขาดทุนมากที่สุด</div>
              {worst.length ? worst.map((r) => <div key={r.sort} className="rk"><span>{r.ref_text || r.customer} · {r.project}</span><b className="neg">{M(r.lines.net)}</b></div>) : <div className="muted">ไม่มีโครงการขาดทุน</div>}
            </div>
          </div>
        </div>
        <div className="card">
          <CardHead title="รายได้ 100 บาท ไปไหน" sub="สัดส่วนต้นทุนและกำไรสุทธิ ทุกโครงการรวมกัน" />
          <div className="pnl-donut">
            <div className="dring">
              <CostDonut data={donut} />
              <div className="mid"><b>{M(revenue)}</b><span>ล้าน รายได้รวม</span></div>
            </div>
            <div className="legend">
              {donut.map((d) => (
                <div key={d.name}>
                  <i style={{ background: d.color }} />
                  <span>{d.name}</span>
                  <b>{M(d.value)} <small>({P(d.value / revenue)})</small></b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid g64 mb">
        <div className="card">
          <CardHead title="งบกำไรขาดทุนรวม" sub="% รวม = ยอดรวม ÷ ราคารวม · % เฉลี่ย/โครงการ = ค่าเฉลี่ยของ % แต่ละโครงการ (แบบคอลัมน์ ค่าเฉลี่ย ในไฟล์) · % เทียบราคาของแต่ละส่วน (ผลิต/ขนส่ง = ราคาขายเสาเข็ม, ตอก = ราคาค่าตอก, บริการ = ราคาค่าบริการ, ดำเนินงาน/สุทธิ = รายได้รวม)" />
          <div className="tbl-wrap">
            <table className="pnl-stmt">
              <thead>
                <tr><th>รายการ</th><th className="num">รวม (ล้าน)</th><th className="num">% รวม</th><th className="num">% เฉลี่ย/โครงการ</th>{chartYears.map((y) => <th key={y.year} className="num">{yLabel(y.year)}</th>)}</tr>
              </thead>
              <tbody>
                {PNL_LINES.map((d) => (
                  <tr key={d.key} className={`lv${d.level} ${d.kind}`}>
                    <td>{d.label}</td>
                    <td className={`num ${d.kind === "profit" && (t[d.key] ?? 0) < 0 ? "neg" : ""}`}>{M(t[d.key] ?? 0)}</td>
                    <td className="num">{P(pctOf(t, d))}</td>
                    <td className="num muted">{d.kind === "rev" ? "" : P(avg[d.key])}</td>
                    {chartYears.map((y) => <td key={y.year} className={`num ${d.kind === "profit" && (y.lines[d.key] ?? 0) < 0 ? "neg" : ""}`}>{M(y.lines[d.key] ?? 0)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <div className="card">
            <CardHead title="สรุปตามปีโครงการ" sub="จากรหัสโครงการ เช่น A69-… = ปี 69" />
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>ปี</th><th className="num">โครงการ</th><th className="num">รายได้ (ล้าน)</th><th className="num">กำไรสุทธิ</th><th className="num">%</th></tr></thead>
                <tbody>
                  {byYear.map((y) => {
                    const p = ratio(y.lines.net, revenueOf(y.lines));
                    return (
                      <tr key={y.year}>
                        <td><b>{yLabel(y.year)}</b>{y.loss > 0 && <div className="sub">ขาดทุน {y.loss} โครงการ</div>}</td>
                        <td className="num">{y.count}</td>
                        <td className="num">{M(revenueOf(y.lines))}</td>
                        <td className={`num ${(y.lines.net ?? 0) < 0 ? "neg" : "pos"}`}>{M(y.lines.net)}</td>
                        <td className="num">{P(p)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {report.params.length > 0 && (
            <div className="card">
              <CardHead title="อัตราที่ใช้คำนวณ" sub="จากไฟล์ (ต่อหน่วยตามสูตรใน Excel)" />
              <div className="pnl-params">
                {report.params.map((p) => <div key={p.name}><span>{p.name}</span><b>{p.value.toLocaleString("th-TH")}</b></div>)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" id="projects">
        <CardHead title="กำไรขาดทุนรายโครงการ" sub="เรียงตามคอลัมน์ได้ · คลิกแถวเพื่อดูงบกำไรขาดทุนของโครงการ" right={<Link className="link" href="/import">ประวัติการนำเข้า</Link>} />
        <ProjectTable rows={rows} years={years} />
      </div>
    </div>
  );
}
