import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { getAsof } from "@/lib/data";
import { addDays, dayRange, dow, fDate, fNum, TH_DAYS } from "@/lib/format";
import { CardHead, Empty, Kpi, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CopyTextButton } from "@/components/CopyText";

export const metadata: Metadata = { title: "ฝ่ายตอก" };

type Rig = { rig_name: string; rig_type: string; company_raw: string; leader: string; last_date: string; last_project: string; qty_14d: number; days_14d: number; idle_days: number };

export default async function DrivePage() {
  const user = await requirePage("drive");
  const supabase = await createClient();
  const asof = await getAsof(supabase);
  const days = dayRange(addDays(asof, 1), addDays(asof, 7));
  const [rigsAll, plans] = await Promise.all([
    fetchAll<Rig>((a, b) => supabase.from("v_rig_status").select("*").gte("last_date", addDays(asof, -29)).order("last_date", { ascending: false }).range(a, b)),
    fetchAll<{ project_code: string; plan_date: string; planned_qty: number }>((a, b) => supabase.from("project_plan_days").select("project_code, plan_date, planned_qty").gte("plan_date", days[0]).lte("plan_date", days[6]).range(a, b)),
  ]);
  const rigs = rigsAll.map((r) => ({ ...r, idle: Number(r.idle_days) > 3 }));
  const plan = new Map(plans.map((p) => [`${p.project_code}|${p.plan_date}`, Number(p.planned_qty)]));
  const share = new Map<string, number>();
  rigs.filter((r) => !r.idle).forEach((r) => share.set(r.last_project, (share.get(r.last_project) ?? 0) + 1));
  const planned = [...new Set(plans.map((p) => p.project_code))];
  const noRig = planned.filter((c) => !share.has(c));
  const idle = rigs.filter((r) => r.idle);
  const d1 = days[0];

  const line = [
    `🏗️ คิวปั้นจั่น ${TH_DAYS[dow(d1)]} ${fDate(d1)}`, "",
    ...[...share.keys()].sort().map((c) => `• ${c} — แผน ${fNum(plan.get(`${c}|${d1}`) ?? 0, 1)} ต้น\n  ${rigs.filter((r) => !r.idle && r.last_project === c).map((r) => `${r.rig_name}${r.leader ? ` (${r.leader})` : ""}`).join(", ")}`),
    ...(idle.length ? ["", `ว่าง: ${idle.map((r) => r.rig_name).join(", ")}`] : []),
    ...(noRig.length ? ["", `มีแผนแต่ยังไม่มีปั้นจั่น: ${noRig.join(", ")}`] : []),
  ].join("\n");

  return (
    <>
      <PageHeader title="คิวปั้นจั่น / ฝ่ายตอก" sub="ปั้นจั่นแต่ละตัวอยู่โครงการไหน แผนงาน 7 วันข้างหน้า และปั้นจั่นที่ว่าง" asof={asof} readOnly={!user.canEdit}
        right={<><CopyTextButton title="ส่ง LINE" text={line} icon="line" /><a className="btn ghost" href="/api/export/rig-queue"><Icon name="dl" />Export Excel</a></>} />
      <div className="grid g4 mb">
        <Kpi tone="blue" icon="crane" label="ปั้นจั่นที่ทำงาน (3 วัน)" value={rigs.length - idle.length} cmp={<div className="cmp">ใช้งานใน 30 วัน {rigs.length} ตัว</div>} />
        <Kpi tone="amber" icon="alert" label="ปั้นจั่นว่าง" value={idle.length} cmp={<div className="cmp">ไม่มีผลงานเกิน 3 วัน</div>} />
        <Kpi tone="green" icon="pile" label="แผนรวม 7 วัน" value={fNum(plans.reduce((s, p) => s + Number(p.planned_qty), 0))} unit="ต้น" cmp={<div className="cmp">{planned.length} โครงการ</div>} />
        <Kpi tone="red" icon="plan" label="มีแผนแต่ไม่มีปั้นจั่น" value={noRig.length} cmp={<div className="cmp">{noRig.slice(0, 3).join(", ") || "–"}</div>} />
      </div>
      <div className="card">
        <CardHead title="คิวปั้นจั่น 7 วันข้างหน้า" sub="อิงโครงการล่าสุดที่ปั้นจั่นทำงาน · ตัวเลข = แผนของโครงการ (แบ่งเท่ากันถ้ามีหลายเครื่อง)" />
        {rigs.length ? (
          <div className="tbl-wrap">
            <table className="heat">
              <thead><tr><th>ปั้นจั่น</th><th>บริษัท / หัวหน้าสาย</th><th>ทำงานล่าสุด</th><th className="num">14 วัน</th><th className="num">เฉลี่ย/วัน</th>
                {days.map((d) => <th key={d} className="h">{TH_DAYS[dow(d)]}<br />{Number(d.slice(8))}</th>)}</tr></thead>
              <tbody>
                {rigs.map((r) => {
                  const n = share.get(r.last_project) ?? 1;
                  return (
                    <tr key={r.rig_name}>
                      <td><b>{r.rig_name}</b><span className="cell-sub">{r.rig_type}</span></td>
                      <td><span className="cell-sub" style={{ color: "var(--ink)" }}>{r.company_raw}</span><span className="cell-sub">{r.leader}</span></td>
                      <td className="nowrap">{r.idle ? <span className="dc a">ว่าง {r.idle_days} วัน</span> : <Link href={`/projects/${r.last_project}`} className="code">{r.last_project}</Link>}<span className="cell-sub">{fDate(r.last_date)}</span></td>
                      <td className="num">{fNum(r.qty_14d)}</td>
                      <td className="num">{r.days_14d ? fNum(Number(r.qty_14d) / Number(r.days_14d), 1) : "–"}</td>
                      {days.map((d) => {
                        const v = r.idle ? 0 : (plan.get(`${r.last_project}|${d}`) ?? 0) / n;
                        return <td key={d} className="h" style={v ? { background: "color-mix(in srgb,var(--s1) 18%,transparent)" } : undefined}>{v ? <><span className="muted" style={{ fontSize: 11 }}>{r.last_project.slice(-4)}</span><br />{fNum(v)}</> : <span className="muted">ว่าง</span>}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>ยังไม่มีข้อมูลปั้นจั่น — นำเข้าไฟล์คิว-วัน</Empty>}
      </div>
    </>
  );
}
