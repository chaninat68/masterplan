import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { getBacklog } from "@/lib/data";
import { BILLING_HEADERS, billingRow, getBilling } from "@/lib/billing";
import { fBaht, fBaht2, fMonth, fNum } from "@/lib/format";
import { CardHead, Empty, Kpi, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { InlineEdit } from "@/components/InlineEdit";
import { CopyTextButton } from "@/components/CopyText";
import { SalesMonthly } from "@/components/charts";
import { updateProject } from "../projects/actions";

export const metadata: Metadata = { title: "การเงิน / วางบิล" };

export default async function FinancePage() {
  const user = await requirePage("finance");
  const supabase = await createClient();
  const [{ asof, month, rows }, bl] = await Promise.all([getBilling(supabase), getBacklog(supabase)]);
  const year = asof.slice(0, 4);
  const sm = await fetchAll<{ month: string; salesperson: string; doc_type: string; amount: number }>((a, b) =>
    supabase.from("v_sales_monthly").select("month, salesperson, doc_type, amount").gte("month", `${year}-01-01`).range(a, b));
  const P = sm.filter((x) => x.doc_type === "P").reduce((s, x) => s + Number(x.amount), 0);
  const RC = sm.filter((x) => x.doc_type !== "P").reduce((s, x) => s + Number(x.amount), 0);
  const months = [...new Set(sm.map((x) => x.month.slice(0, 7)))].sort();
  const chart = months.map((m) => {
    const p = sm.filter((x) => x.month.startsWith(m) && x.doc_type === "P").reduce((s, x) => s + Number(x.amount), 0);
    const rc = sm.filter((x) => x.month.startsWith(m) && x.doc_type !== "P").reduce((s, x) => s + Number(x.amount), 0);
    return { label: fMonth(m), P: p, RC: rc, net: p + rc };
  });
  const bySales = new Map<string, { P: number; RC: number }>();
  for (const x of sm) {
    const o = bySales.get(x.salesperson) ?? { P: 0, RC: 0 };
    if (x.doc_type === "P") o.P += Number(x.amount); else o.RC += Number(x.amount);
    bySales.set(x.salesperson, o);
  }
  const sellers = [...bySales.entries()].sort((a, b) => b[1].P + b[1].RC - (a[1].P + a[1].RC));
  const mQ = rows.reduce((s, r) => s + r.monthQty, 0), mV = rows.reduce((s, r) => s + r.monthValue, 0);
  const tsv = [BILLING_HEADERS, ...rows.map(billingRow)].map((r) => r.join("\t")).join("\n");

  return (
    <>
      <PageHeader title="การเงิน / วางบิล" sub="มูลค่าผลงานตามรอบวางบิล และยอดขายสุทธิ (P − R − C) สำหรับฝ่ายบัญชี" asof={asof} readOnly={!user.canEdit}
        right={<><a className="btn ghost" href="/api/export/billing"><Icon name="dl" />Export รายงานวางบิล</a><CopyTextButton title="คัดลอกไป Excel" text={tsv} /></>} />
      <div className="grid g4 mb">
        <Kpi tone="blue" icon="money" label={`มูลค่าผลงานเดือน ${fMonth(month)}`} value={fBaht(mV)} cmp={<div className="cmp">{fNum(mQ)} ต้น · {rows.filter((r) => r.monthQty).length} โครงการ</div>} />
        <Kpi tone="green" icon="trend" label={`ยอดขายสุทธิ ปี ${Number(year) + 543}`} value={fBaht(P + RC)} cmp={<div className="cmp">เปิดขาย (P) {fBaht(P)}</div>} />
        <Kpi tone="red" icon="doc" label="ลด/เปลี่ยนแปลง (R+C)" value={fBaht(RC)} cmp={<div className="cmp">{P ? fNum((Math.abs(RC) / P) * 100, 1) : 0}% ของ P</div>} />
        <Kpi tone="amber" icon="cal" label="มูลค่างานคงเหลือ" value={fBaht(bl.backlog_value)} cmp={<div className="cmp">โครงการกำลังตอก + รอเริ่ม</div>} />
      </div>
      <div className="card mb">
        <CardHead title={`รายงานวางบิล เดือน ${fMonth(month)}`} sub={`มูลค่าผลงาน = ต้นที่ตอก × มูลค่าเฉลี่ย/ต้น · รอบวางบิลกำหนดเองได้ต่อโครงการ${user.canEdit ? " (คลิกเพื่อแก้)" : ""}`} />
        {rows.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>โครงการ</th><th>ลูกค้า</th><th>รอบส่งมอบ / วางบิล</th><th className="num">ตอกแล้ว</th><th className="num">มูลค่า/ต้น</th><th className="num">มูลค่าผลงานสะสม</th><th className="num">ต้นเดือนนี้</th><th className="num">มูลค่าเดือนนี้</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code}>
                    <td><Link href={`/projects/${r.code}`} className="code">{r.code}</Link><span className="cell-sub">{r.name}</span></td>
                    <td><span className="cell-sub" style={{ maxWidth: 220, color: "var(--ink)" }}>{r.customer}</span></td>
                    <td><InlineEdit canEdit={user.canEdit} value={r.billing} placeholder="+ กำหนดรอบ" onSave={updateProject.bind(null, r.code, "billing_cycle")} /></td>
                    <td className="num">{fNum(r.done, 1)}</td><td className="num">{fBaht2(r.vpp)}</td><td className="num">{fBaht2(r.valueDone)}</td>
                    <td className="num">{fNum(r.monthQty)}</td><td className="num"><b>{fBaht2(r.monthValue)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>ยังไม่มีผลงานในเดือนนี้</Empty>}
      </div>
      <div className="grid g64">
        <div className="card">
          <CardHead title="ยอดขายรายเดือน" sub="เปิดขาย (P) และลด/เปลี่ยนแปลง (R+C) · บาท" />
          <div className="legend"><span><i style={{ background: "var(--s1)" }} />P เปิดขาย</span><span><i style={{ background: "var(--s2)" }} />R+C ลด/เปลี่ยนแปลง</span><span><i className="line" style={{ background: "var(--ink)" }} />สุทธิ</span></div>
          <div className="chart-box">{chart.length ? <SalesMonthly data={chart} /> : <Empty>ยังไม่มีข้อมูลขาย — นำเข้าไฟล์ SO</Empty>}</div>
        </div>
        <div className="card">
          <CardHead title="ยอดขายสุทธิตามเซลล์" sub={`ปี ${Number(year) + 543}`} />
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>เซลล์</th><th className="num">P</th><th className="num">R+C</th><th className="num">สุทธิ</th></tr></thead>
              <tbody>{sellers.map(([k, o]) => <tr key={k}><td>{k}</td><td className="num">{fBaht(o.P)}</td><td className="num down">{fBaht(o.RC)}</td><td className="num"><b>{fBaht(o.P + o.RC)}</b></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
