import type { Metadata } from "next";
import { requirePage } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { getBacklog } from "@/lib/data";
import { addDays, fBaht, fDate, fDateShort, fNum } from "@/lib/format";
import { CardHead, Empty, Kpi, PageHeader } from "@/components/ui";
import { InlineEdit } from "@/components/InlineEdit";
import { HBar, RunwayForecast } from "@/components/charts";
import { setSetting } from "../projects/actions";

export const metadata: Metadata = { title: "ยอดขาย & Runway" };

type Doc = { project_code: string; doc_type: string; doc_date: string; customer_name: string; customer_code: string | null; amount: number; approval_status: string; salesperson: string; is_new_customer: boolean };

export default async function SalesPage() {
  const user = await requirePage("sales");
  const supabase = await createClient();
  const bl = await getBacklog(supabase);
  const year = bl.asof.slice(0, 4);
  const [docs, { count: onHand }] = await Promise.all([
    fetchAll<Doc>((a, b) => supabase.from("sales_docs").select("project_code, doc_type, doc_date, customer_name, customer_code, amount, approval_status, salesperson, is_new_customer").gte("doc_date", `${year}-01-01`).order("id").range(a, b)),
    supabase.from("projects").select("code", { count: "exact", head: true }).eq("status", "on_hand"),
  ]);
  const w = bl.runway_weeks;
  const lvl = bl.level;
  const end = w != null ? addDays(bl.asof, Math.round(w * 7)) : null;
  const warnAt = w != null ? addDays(bl.asof, Math.round((w - bl.threshold_weeks) * 7)) : null;
  const W = Math.min(30, Math.max(8, Math.ceil((w ?? 9) + 3)));
  const forecast = Array.from({ length: W + 1 }, (_, k) => ({ label: k === 0 ? "ตอนนี้" : fDateShort(addDays(bl.asof, k * 7)), remain: Math.max(0, Math.round(bl.backlog_qty - bl.rate_per_week * k)) }));
  const warnIdx = w != null ? Math.max(0, Math.round(w - bl.threshold_weeks)) : -1;

  const pend = new Map<string, { code: string; cust: string; amt: number; d: string; sales: string }>();
  for (const x of docs.filter((x) => x.approval_status === "รออนุมัติ" && x.doc_type === "P")) {
    const o = pend.get(x.project_code) ?? { code: x.project_code, cust: x.customer_name, amt: 0, d: x.doc_date, sales: x.salesperson };
    o.amt += Number(x.amount);
    if (x.doc_date > o.d) o.d = x.doc_date;
    pend.set(x.project_code, o);
  }
  const pendList = [...pend.values()].sort((a, b) => b.d.localeCompare(a.d));
  const newC = new Set(docs.filter((x) => x.is_new_customer).map((x) => x.customer_code ?? x.customer_name));
  const oldC = new Set(docs.filter((x) => !x.is_new_customer).map((x) => x.customer_code ?? x.customer_name));
  const bySeller = new Map<string, number>();
  docs.forEach((x) => bySeller.set(x.salesperson, (bySeller.get(x.salesperson) ?? 0) + Number(x.amount)));
  const sellers = [...bySeller.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  return (
    <>
      <PageHeader title="ยอดขาย & Runway" sub="งานในมือเหลือพอทำอีกกี่สัปดาห์ และเมื่อไรต้องเร่งเซลล์หายอด" asof={bl.asof} readOnly={!user.canEdit} />
      <div className="grid g64 mb">
        <div className={`card kpi-card t-${lvl === "red" ? "red" : lvl === "amber" ? "amber" : "green"}`}>
          <CardHead title="Runway งานในมือ" sub="งานคงเหลือ ÷ อัตราตอกเฉลี่ย 4 สัปดาห์ล่าสุด"
            right={<div className="chip">เตือนเมื่อต่ำกว่า <b style={{ color: "var(--ink)" }}><InlineEdit canEdit={user.canEdit} type="number" width={60} value={String(bl.threshold_weeks)} onSave={setSetting.bind(null, "runway_weeks")} /></b> สัปดาห์</div>} />
          <div className="runway">
            <div className="big">{w == null ? "∞" : fNum(w, 1)}<small> สัปดาห์</small></div>
            <div>
              <div className={`statusline ${lvl === "red" ? "r" : lvl === "amber" ? "a" : "g"}`}>{lvl === "red" ? "▼ ต้องเร่งหายอดขายทันที" : lvl === "amber" ? "● เฝ้าระวัง — เริ่มเร่งปิดการขาย" : "▲ งานในมือเพียงพอ"}</div>
              <div className="sub" style={{ marginTop: 8 }}>งานจะหมดประมาณ <b style={{ color: "var(--ink)" }}>{fDate(end)}</b> · ควรได้งานใหม่ก่อน <b style={{ color: "var(--ink)" }}>{fDate(warnAt)}</b></div>
            </div>
          </div>
          <div className="mini" style={{ marginTop: 16, marginBottom: 0 }}>
            <div><label>งานคงเหลือ</label><b>{fNum(bl.backlog_qty)}</b> <span className="muted">ต้น</span></div>
            <div><label>มูลค่าคงเหลือ</label><b>{fBaht(bl.backlog_value)}</b></div>
            <div><label>อัตราตอก</label><b>{fNum(bl.rate_per_week)}</b> <span className="muted">ต้น/สัปดาห์</span></div>
            <div><label>พักงาน (ไม่นับ)</label><b>{fNum(bl.hold_qty)}</b> <span className="muted">ต้น</span></div>
          </div>
        </div>
        <div className="card">
          <CardHead title="พยากรณ์งานคงเหลือ" sub="ต้น · ถ้าไม่มีงานใหม่เข้ามาและตอกด้วยอัตราเดิม (จุดแดง = ถึงเกณฑ์เตือน)" />
          <div className="chart-box"><RunwayForecast data={forecast} warnLabel={forecast[warnIdx]?.label} /></div>
        </div>
      </div>
      <div className="grid g3 mb">
        <Kpi tone="amber" icon="doc" label="SO รออนุมัติ" value={pendList.length} unit="โครงการ" cmp={<div className="cmp">{fBaht(pendList.reduce((s, x) => s + x.amt, 0))}</div>} />
        <Kpi tone="blue" icon="cal" label="รอเริ่มตอก (On Hand)" value={onHand ?? 0} unit="โครงการ" cmp={<div className="cmp">{fNum(bl.on_hand_qty)} ต้น</div>} />
        <Kpi tone="green" icon="users" label={`ลูกค้าปี ${Number(year) + 543}`} value={newC.size} unit="รายใหม่" cmp={<div className="cmp">ลูกค้าเก่า {oldC.size} ราย</div>} />
      </div>
      <div className="grid g2">
        <div className="card">
          <CardHead title="ยอดขายสุทธิตามเซลล์" sub={`ปี ${Number(year) + 543} · บาท`} />
          <div className="chart-box">{sellers.length ? <HBar data={sellers} money /> : <Empty>ยังไม่มีข้อมูลขาย</Empty>}</div>
        </div>
        <div className="card">
          <CardHead title="SO รออนุมัติล่าสุด" sub="งานที่กำลังจะเข้ามาเติม Runway" />
          <div className="tbl-wrap" style={{ maxHeight: 300, overflow: "auto" }}>
            <table>
              <thead><tr><th>โครงการ</th><th>เซลล์</th><th>วันที่</th><th className="num">มูลค่า</th></tr></thead>
              <tbody>{pendList.slice(0, 50).map((o) => <tr key={o.code}><td><span className="code">{o.code}</span><span className="cell-sub">{o.cust}</span></td><td>{o.sales}</td><td className="nowrap">{fDate(o.d)}</td><td className="num">{fBaht(o.amt)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
