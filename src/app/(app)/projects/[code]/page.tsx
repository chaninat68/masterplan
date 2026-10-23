import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { getAsof, getProjects } from "@/lib/data";
import { canSeeSales } from "@/lib/roles";
import { addDays, dayRange, fBaht2, fDate, fDateShort, fNum, STATUS_LABEL } from "@/lib/format";
import { AheadChip, CardHead, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { InlineEdit } from "@/components/InlineEdit";
import { SCurve } from "@/components/charts";
import { updateProject } from "../actions";
import { DayGrid, type DayLog } from "./DayGrid";

export async function generateMetadata(props: PageProps<"/projects/[code]">): Promise<Metadata> {
  return { title: (await props.params).code };
}

type SoDoc = { doc_type: string; doc_date: string; group_product: string; item_kind: string; qty: number; amount: number; approval_status: string };

export default async function ProjectPage(props: PageProps<"/projects/[code]">) {
  const user = await requirePage("projects");
  const { code: raw } = await props.params;
  const code = decodeURIComponent(raw).toUpperCase();
  if (!/^[A-Z]\d{2}-[A-Z]\d{3,4}$/.test(code)) notFound(); // ใช้ใน filter ของ PostgREST ด้วย ต้องตรวจรูปแบบก่อน
  const sp = await props.searchParams;
  const tab = sp.tab === "curve" || sp.tab === "so" ? sp.tab : "days";
  const supabase = await createClient();
  const [asof, [p]] = await Promise.all([getAsof(supabase), getProjects(supabase, { codes: [code] })]);
  if (!p) notFound();

  const showSales = canSeeSales(user.role);
  const [plans, actuals, logs, notesRes, so] = await Promise.all([
    fetchAll<{ plan_date: string; planned_qty: number }>((a, b) => supabase.from("project_plan_days").select("plan_date, planned_qty").eq("project_code", code).order("plan_date").range(a, b)),
    fetchAll<{ work_date: string; qty: number }>((a, b) => supabase.from("v_project_actual_days").select("work_date, qty").eq("project_code", code).order("work_date").range(a, b)),
    fetchAll<DayLog>((a, b) => supabase.from("drive_logs").select("id, work_date, rig_name, rig_type, size_code, length_m, shift, qty, leader, company_raw, source").eq("project_code", code).gt("qty", 0).order("work_date").range(a, b)),
    supabase.from("daily_notes").select("project_code, note_date, body").or(`project_code.eq.${code},project_code.is.null`).limit(1000),
    showSales
      ? fetchAll<SoDoc>((a, b) => supabase.from("sales_docs").select("doc_type, doc_date, group_product, item_kind, qty, amount, approval_status").eq("project_code", code).order("doc_date").range(a, b))
      : Promise.resolve([] as SoDoc[]),
  ]);

  const plan: Record<string, number> = Object.fromEntries(plans.map((x) => [x.plan_date, Number(x.planned_qty)]));
  const actual: Record<string, number> = Object.fromEntries(actuals.map((x) => [x.work_date, Number(x.qty)]));
  const notes: Record<string, string> = {}, coNotes: Record<string, string> = {};
  for (const n of notesRes.data ?? []) (n.project_code ? notes : coNotes)[n.note_date] = n.body;

  // S-curve
  const keys = [...Object.keys(plan), ...Object.keys(actual)].sort();
  let cp = 0, ca = 0;
  const curve = keys.length
    ? dayRange(keys[0], keys[keys.length - 1]).map((d) => {
        cp += plan[d] ?? 0;
        if (d <= asof) ca += actual[d] ?? 0;
        return { label: fDateShort(d), plan: Math.round(cp * 10) / 10, actual: d <= asof ? Math.round(ca * 10) / 10 : null };
      })
    : [];
  // ขนาด / ความยาว จากคิว-วัน
  const sizes = new Map<string, { size: string; len: number | null; done: number }>();
  for (const l of logs) {
    const k = `${l.size_code}|${l.length_m}`;
    const o = sizes.get(k) ?? { size: l.size_code, len: l.length_m, done: 0 };
    o.done += Number(l.qty);
    sizes.set(k, o);
  }
  const soQty = so.filter((s) => s.item_kind !== "บริการ" && s.group_product !== "Service" && s.group_product !== "").reduce((s, x) => s + Number(x.qty), 0);
  const soAmt = so.reduce((s, x) => s + Number(x.amount), 0);
  const hasP = so.some((s) => s.doc_type === "P");
  const save = (field: Parameters<typeof updateProject>[1]) => updateProject.bind(null, code, field);
  const ce = user.canEdit;

  return (
    <>
      <PageHeader
        title={<><span className="code" style={{ fontSize: "inherit" }}>{p.code}</span> {p.project_name}</>}
        sub={<><Link href="/projects" className="link">← แผน / ผลงาน</Link> · {p.customer_name}</>}
        asof={asof} readOnly={!ce} right={<StatusBadge status={p.status} />} />

      <div className="fields mb">
        <div><label>ลูกค้า</label><InlineEdit canEdit={ce} value={p.customer_name} onSave={save("customer_name")} /></div>
        <div><label>ชื่อโครงการ</label><InlineEdit canEdit={ce} value={p.project_name} onSave={save("project_name")} /></div>
        <div><label>PM</label><InlineEdit canEdit={ce} value={p.pm} onSave={save("pm")} /></div>
        <div><label>Sales</label><InlineEdit canEdit={ce} value={p.sales} onSave={save("sales")} /></div>
        <div><label>สถานะ</label><InlineEdit canEdit={ce} type="select" value={p.status} display={<StatusBadge status={p.status} />} onSave={save("status")}
          options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} /></div>
        <div><label>กำหนดเริ่ม</label><InlineEdit canEdit={ce} type="date" value={p.start_date ?? ""} display={fDate(p.start_date)} onSave={save("start_date")} /></div>
        <div><label>กำหนดเสร็จ</label><InlineEdit canEdit={ce} type="date" value={p.end_date ?? ""} display={fDate(p.end_date)} onSave={save("end_date")} /></div>
        <div><label>ยอดสั่งซื้อ (ต้น) · {p.order_source === "master_planning" ? "Master Planning" : p.order_source === "sales" ? "ใบ P−R−C" : "คิว-วัน"}</label><InlineEdit canEdit={ce} type="number" value={String(p.order_qty)} display={fNum(p.order_qty)} onSave={save("order_qty")} /></div>
        {showSales && <div><label>มูลค่าโครงการ</label><InlineEdit canEdit={ce} type="number" value={String(p.contract_value)} display={fBaht2(p.contract_value)} onSave={save("contract_value")} /></div>}
        {showSales && <div><label>มูลค่าเฉลี่ย/ต้น</label><InlineEdit canEdit={ce} type="number" value={String(p.value_per_pile)} display={fBaht2(p.value_per_pile)} onSave={save("value_per_pile")} /></div>}
        <div><label>รอบส่งมอบ / วางบิล</label><InlineEdit canEdit={ce} value={p.billing_cycle} placeholder="+ กำหนดรอบ" onSave={save("billing_cycle")} /></div>
      </div>

      <div className="mini">
        <div><label>ตอกแล้ว</label><b>{fNum(p.done_qty, 1)}</b></div>
        <div><label>คงเหลือ</label><b>{fNum(p.remain_qty, 1)}</b></div>
        <div><label>แผนสะสมถึง {fDateShort(asof)}</label><b>{fNum(p.plan_to_date, 1)}</b></div>
        <div><label>เทียบแผน</label><b><AheadChip ab={p.ahead_behind} hasPlan={p.has_plan} /></b></div>
        <div><label>อัตรา 14 วัน</label><b>{p.rate_per_day ? fNum(p.rate_per_day, 1) : "–"}</b> <span className="muted">ต้น/วัน</span></div>
        <div><label>คาดว่าเสร็จ</label><b>{fDate(p.eta)}</b></div>
      </div>

      {showSales && hasP && Math.abs(soQty - p.order_qty) >= 0.5 && p.order_source === "master_planning" && (
        <div className="banner" style={{ background: "var(--warn-soft)" }}>
          ⚠ ใบ P−R−C ในระบบขายรวมได้ <b>{fNum(soQty)} ต้น</b> ไม่ตรงกับ Master Planning <b>{fNum(p.order_qty)} ต้น</b> — ระบบใช้ Master Planning เป็นหลัก ควรตรวจใบเปลี่ยนแปลง
        </div>
      )}

      <div className="seg dtabs">
        <Link href={`/projects/${code}`} className={tab === "days" ? "on" : ""} scroll={false}>แผนเทียบผลงานรายวัน</Link>
        <Link href={`/projects/${code}?tab=curve`} className={tab === "curve" ? "on" : ""} scroll={false}>S-curve &amp; ขนาดเสา</Link>
        {showSales && so.length > 0 && <Link href={`/projects/${code}?tab=so`} className={tab === "so" ? "on" : ""} scroll={false}>ใบ P − R − C</Link>}
      </div>

      {tab === "days" && (
        <DayGrid code={code} asof={asof} canEdit={ce} plan={plan} actual={actual} notes={notes} coNotes={coNotes}
          logs={logs.filter((l) => l.work_date >= addDays(asof, -400))} finished={p.status === "completed" || p.status === "cancelled"} />
      )}
      {tab === "curve" && (
        <div className="grid g2">
          <div className="card">
            <CardHead title="S-curve แผนเทียบจริง" sub="ยอดสะสม (ต้น)" />
            <div className="legend"><span><i className="dash" />แผนสะสม</span><span><i className="line" style={{ background: "var(--s1)" }} />ทำจริงสะสม</span></div>
            <div className="chart-box">{curve.length ? <SCurve data={curve} /> : <Empty>ยังไม่มีแผนหรือผลงาน</Empty>}</div>
          </div>
          <div className="card">
            <CardHead title="ยอดตามขนาด / ความยาว" sub="ผลงานจากไฟล์คิว-วัน" />
            {sizes.size ? (
              <div className="tbl-wrap" style={{ maxHeight: 320, overflow: "auto" }}>
                <table>
                  <thead><tr><th>ขนาด</th><th className="num">ยาว (ม.)</th><th className="num">ตอกแล้ว (ต้น)</th></tr></thead>
                  <tbody>{[...sizes.values()].sort((a, b) => a.size.localeCompare(b.size) || Number(a.len) - Number(b.len)).map((s) => (
                    <tr key={`${s.size}${s.len}`}><td><b>{s.size || "–"}</b></td><td className="num">{fNum(s.len, 1)}</td><td className="num">{fNum(s.done)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <Empty>ยังไม่มีข้อมูลการตอก</Empty>}
          </div>
        </div>
      )}
      {tab === "so" && showSales && (
        <div className="card">
          <CardHead title="ใบ P − R − C" sub={`${so.length} รายการ · ใช้ตรวจเทียบกับ Master Planning`} right={<div>จำนวนสุทธิ <b>{fNum(soQty)} ต้น</b> · มูลค่าสุทธิ <b>{fBaht2(soAmt)}</b></div>} />
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>วันที่</th><th>ประเภท</th><th>รายการ</th><th className="num">จำนวน</th><th className="num">มูลค่า</th><th>สถานะ</th></tr></thead>
              <tbody>{so.map((s, i) => (
                <tr key={i}>
                  <td className="nowrap">{fDate(s.doc_date)}</td>
                  <td>{s.doc_type === "P" ? <span className="dc g">P เปิดขาย</span> : <span className="dc r">{s.doc_type} ลด/เปลี่ยน</span>}</td>
                  <td>{s.item_kind === "บริการ" || s.group_product === "Service" ? <span className="muted">(บริการ ไม่นับต้น) </span> : null}{s.group_product}</td>
                  <td className="num">{fNum(s.qty)}</td><td className="num">{fBaht2(s.amount)}</td><td className="muted">{s.approval_status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
