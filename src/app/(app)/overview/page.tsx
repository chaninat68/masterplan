import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { getBacklog, getProjects } from "@/lib/data";
import { canSeeSales } from "@/lib/roles";
import { addDays, dayRange, dow, fBaht, fDate, fDateShort, fNum, STATUS_LABEL, TH_DAYS } from "@/lib/format";
import { AheadChip, CardHead, Delta, Empty, Kpi, PageHeader, Progress } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DailyStack, Donut } from "@/components/charts";
import { CopyTextButton } from "@/components/CopyText";
import { RangeToggle } from "./RangeToggle";

export const metadata: Metadata = { title: "ภาพรวม" };

type DayLog = { work_date: string; project_code: string; qty: number; province: string; rig_type: string };

export default async function OverviewPage(props: PageProps<"/overview">) {
  const user = await requirePage("overview");
  const sp = await props.searchParams;
  const range = sp.range === "90" ? 90 : 30;
  const supabase = await createClient();
  const [bl, projects] = await Promise.all([getBacklog(supabase), getProjects(supabase)]);
  const asof = bl.asof;
  const ym = asof.slice(0, 7);
  const prevMonthEnd = addDays(ym + "-01", -1);
  const pm = prevMonthEnd.slice(0, 7);
  const dom = Number(asof.slice(8));
  const from60 = addDays(asof, -59);
  const fromChart = addDays(asof, -(range - 1));
  const sinceLogs = [pm + "-01", from60].sort()[0];

  const [logs, daily, notesRes, batchesRes, salesRes] = await Promise.all([
    fetchAll<DayLog>((a, b) => supabase.from("drive_logs").select("work_date, project_code, qty, province, rig_type").gte("work_date", sinceLogs).lte("work_date", asof).order("id").range(a, b)),
    fetchAll<{ work_date: string; company_category: string; qty: number }>((a, b) => supabase.from("v_daily_company").select("work_date, company_category, qty").gte("work_date", fromChart).lte("work_date", asof).range(a, b)),
    supabase.from("daily_notes").select("project_code, note_date, body, source").neq("body", "ไม่มีการตอก").gte("note_date", addDays(asof, -60)).order("note_date", { ascending: false }).limit(5),
    supabase.from("import_batches").select("file_name, rows_added, created_at, undone_at").order("created_at", { ascending: false }).limit(3),
    canSeeSales(user.role)
      ? fetchAll<{ project_code: string; doc_type: string; doc_date: string; approval_status: string }>((a, b) =>
          supabase.from("sales_docs").select("project_code, doc_type, doc_date, approval_status").or(`doc_date.gte.${ym}-01,approval_status.eq.รออนุมัติ`).order("id").range(a, b))
      : Promise.resolve([] as { project_code: string; doc_type: string; doc_date: string; approval_status: string }[]),
  ]);

  const byCode = new Map(projects.map((p) => [p.code, p]));
  const vpp = (c: string) => byCode.get(c)?.value_per_pile ?? 0;
  const dayQty = (d: string) => logs.filter((l) => l.work_date === d).reduce((s, l) => s + Number(l.qty), 0);
  const workDays = [...new Set(logs.filter((l) => Number(l.qty) > 0).map((l) => l.work_date))].sort();
  const prevDay = workDays.filter((d) => d < asof).pop() ?? addDays(asof, -1);
  const inMonth = (l: DayLog, m: string, lim?: number) => l.work_date.startsWith(m) && (!lim || Number(l.work_date.slice(8)) <= lim);
  const mL = logs.filter((l) => inMonth(l, ym)), pmL = logs.filter((l) => inMonth(l, pm, dom));
  const sum = (a: DayLog[], f: (l: DayLog) => number) => a.reduce((s, l) => s + f(l), 0);
  const mQ = sum(mL, (l) => Number(l.qty)), pmQ = sum(pmL, (l) => Number(l.qty));
  const mV = sum(mL, (l) => Number(l.qty) * vpp(l.project_code)), pmV = sum(pmL, (l) => Number(l.qty) * vpp(l.project_code));
  const lvl = bl.level === "red" ? "red" : bl.level === "amber" ? "amber" : "green";
  const runwayTxt = bl.runway_weeks == null ? "∞" : fNum(bl.runway_weeks, 1);

  const ongoing = projects.filter((p) => p.status === "ongoing").sort((a, b) => b.remain_qty - a.remain_qty);
  const behind = ongoing.filter((p) => p.has_plan && p.ahead_behind <= -0.5).sort((a, b) => a.ahead_behind - b.ahead_behind);
  const flowP = projects.filter((p) => p.status === "ongoing" || p.status === "on_hand");
  const flowOrd = flowP.reduce((s, p) => s + p.order_qty, 0), flowDone = flowP.reduce((s, p) => s + p.done_qty, 0);
  const flowVal = flowP.reduce((s, p) => s + p.contract_value, 0);
  const sales = salesRes;
  const soNew = new Set(sales.filter((s) => s.doc_type === "P" && s.doc_date >= ym + "-01").map((s) => s.project_code)).size;
  const pend = new Set(sales.filter((s) => s.approval_status === "รออนุมัติ").map((s) => s.project_code)).size;
  const billDue = new Set(mL.filter((l) => byCode.get(l.project_code)?.status === "ongoing").map((l) => l.project_code)).size;
  const statusCount = (s: string) => projects.filter((p) => p.status === s).length;

  // กราฟรายวัน
  const chartDays = dayRange(fromChart, asof);
  const chart = chartDays.map((d) => {
    const row = { label: fDateShort(d), asia: 0, asia_joint: 0, subcontractor: 0 };
    for (const x of daily.filter((x) => x.work_date === d)) row[x.company_category as "asia"] += Number(x.qty);
    return row;
  });
  // จังหวัด / ประเภทปั้นจั่น (30 วัน เทียบ 30 วันก่อน)
  const f30 = addDays(asof, -29);
  const prov = new Map<string, { cur: number; prev: number }>(), rt = new Map<string, number>();
  for (const l of logs) {
    if (l.work_date < from60) continue;
    const k = l.province || "ไม่ระบุ";
    const o = prov.get(k) ?? { cur: 0, prev: 0 };
    if (l.work_date >= f30) { o.cur += Number(l.qty); rt.set(l.rig_type || "ไม่ระบุ", (rt.get(l.rig_type || "ไม่ระบุ") ?? 0) + Number(l.qty)); }
    else o.prev += Number(l.qty);
    prov.set(k, o);
  }
  const provs = [...prov.entries()].filter(([, o]) => o.cur > 0).sort((a, b) => b[1].cur - a[1].cur).slice(0, 7);
  const pmax = Math.max(1, ...provs.map(([, o]) => o.cur));
  const rts = [...rt.entries()].sort((a, b) => b[1] - a[1]);
  const rtot = Math.max(1, rts.reduce((s, [, v]) => s + v, 0));

  // ข้อความสรุปส่ง LINE
  const todayLogs = logs.filter((l) => l.work_date === asof);
  const byP = new Map<string, number>();
  todayLogs.forEach((l) => byP.set(l.project_code, (byP.get(l.project_code) ?? 0) + Number(l.qty)));
  const lineText = [
    `📋 สรุปผลงานตอก ${TH_DAYS[dow(asof)]} ${fDate(asof)}`,
    `รวม ${fNum(dayQty(asof))} ต้น | ${byP.size} โครงการ`,
    "",
    ...[...byP.entries()].sort((a, b) => b[1] - a[1]).map(([c, q]) => `• ${c} ${byCode.get(c)?.project_name ?? ""}: ${fNum(q)} ต้น`),
    "",
    `เดือนนี้ ${fNum(mQ)} ต้น · มูลค่า ${fBaht(mV)}`,
    `โครงการช้ากว่าแผน ${behind.length} โครงการ · Runway ${runwayTxt} สัปดาห์`,
  ].join("\n");

  const notes = notesRes.data ?? [];
  const batches = batchesRes.data ?? [];

  return (
    <>
      <PageHeader title={`สวัสดี, ${user.name}`} sub="ภาพรวมงานตอกเสาเข็มและงานในมือของบริษัท" asof={asof} readOnly={!user.canEdit}
        right={<CopyTextButton title="สรุปส่ง LINE" text={lineText} icon="line" />} />
      <div className="grid g4 mb">
        <Kpi tone="blue" icon="pile" label={`ตอกวันล่าสุด · ${fDateShort(asof)}`} value={fNum(dayQty(asof))} unit="ต้น" cmp={<Delta cur={dayQty(asof)} prev={dayQty(prevDay)} label={`เทียบ ${fDateShort(prevDay)}`} />} />
        <Kpi tone="green" icon="day" label="ตอกเดือนนี้" value={fNum(mQ)} unit="ต้น" cmp={<Delta cur={mQ} prev={pmQ} label="เทียบช่วงเดียวกันเดือนก่อน" />} />
        <Kpi tone="amber" icon="money" label="มูลค่าผลงานเดือนนี้" value={fBaht(mV)} cmp={<Delta cur={mV} prev={pmV} label="เทียบช่วงเดียวกันเดือนก่อน" />} />
        <Kpi tone={lvl} icon="alert" label="งานในมือพอทำอีก" value={runwayTxt} unit="สัปดาห์"
          cmp={<div className="cmp"><span className={bl.level === "green" ? "up" : "down"}>{bl.level === "red" ? "ต้องเร่งหายอดขาย" : bl.level === "amber" ? "เฝ้าระวัง" : "ปกติ"}</span> · เกณฑ์ {fNum(bl.threshold_weeks)} สัปดาห์</div>} />
      </div>

      <div className="grid g12 mb">
        <div className="card span7">
          <CardHead title="โครงการที่กำลังตอก" sub={`${ongoing.length} โครงการ · ขีดดำบนแถบ = ตำแหน่งตามแผน ณ วันนี้`} href="/projects?tab=ongoing" />
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>โครงการ</th><th className="num">ตอกแล้ว / สั่งซื้อ</th><th>เทียบแผน</th><th style={{ minWidth: 140 }}>ความคืบหน้า</th></tr></thead>
              <tbody>
                {ongoing.slice(0, 7).map((p) => (
                  <tr key={p.code} className="prow">
                    <td><Link href={`/projects/${p.code}`} className="code">{p.code}</Link><span className="cell-sub" style={{ maxWidth: 190 }}>{p.project_name}</span></td>
                    <td className="num"><b>{fNum(p.done_qty)}</b> <span className="muted">/ {fNum(p.order_qty)}</span></td>
                    <td><AheadChip ab={p.ahead_behind} hasPlan={p.has_plan} /></td>
                    <td><Progress pct={p.pct_done} planPct={p.pct_plan} hasPlan={p.has_plan} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ongoing.length && <Empty>ยังไม่มีโครงการที่กำลังตอก — นำเข้าไฟล์ Master Planning ก่อน</Empty>}
        </div>
        <div className="card span5 flexcol">
          <CardHead title="ผลงานตอกรายวัน" sub="ต้น/วัน แยกตามเจ้าของปั้นจั่น" right={<RangeToggle value={range} />} />
          <div className="legend"><span><i style={{ background: "var(--s1)" }} />เอเซีย</span><span><i style={{ background: "var(--s2)" }} />เอเซียร่วม</span><span><i style={{ background: "var(--s3)" }} />ผู้รับเหมาร่วม</span></div>
          <div className="chart-box grow"><DailyStack data={chart} /></div>
        </div>
      </div>

      <div className="grid g3 mb">
        <div className="card">
          <CardHead title="งานในมือ" sub={`คงเหลือ ${fNum(bl.backlog_qty)} ต้น · ${fBaht(bl.backlog_value)}`} href="/sales" linkLabel="ดูเพิ่ม" />
          <div className="donut-wrap sm">
            <div className="donut-box">
              <Donut unit="ต้น" data={[{ name: "กำลังตอก", value: bl.ongoing_qty, color: "var(--s1)" }, { name: "รอเริ่ม", value: bl.on_hand_qty, color: "var(--s2)" }, { name: "พักงาน", value: bl.hold_qty, color: "var(--line-2)" }]} />
              <div className="donut-c"><div><b>{runwayTxt}</b><span>สัปดาห์</span></div></div>
            </div>
            <div className="dl">
              <div><i style={{ background: "var(--s1)" }} /><span>กำลังตอก</span><b>{fNum(bl.ongoing_qty)}</b><span className="p">ต้น</span></div>
              <div><i style={{ background: "var(--s2)" }} /><span>รอเริ่ม</span><b>{fNum(bl.on_hand_qty)}</b><span className="p">ต้น</span></div>
              <div><i style={{ background: "var(--line-2)" }} /><span>พักงาน*</span><b>{fNum(bl.hold_qty)}</b><span className="p">ต้น</span></div>
            </div>
          </div>
          <div className="sub" style={{ marginTop: 8 }}>อัตราตอก {fNum(bl.rate_per_week)} ต้น/สัปดาห์ · * พักงานไม่นับใน Runway</div>
        </div>
        <div className="card">
          <CardHead title="สถานะโครงการ" sub={`ทั้งหมด ${projects.length} โครงการ`} />
          <div className="donut-wrap sm">
            <div className="donut-box">
              <Donut unit="โครงการ" data={(["ongoing", "on_hand", "hold", "completed", "cancelled"] as const).map((s, i) => ({ name: STATUS_LABEL[s], value: statusCount(s), color: `var(--s${i + 1})` }))} />
              <div className="donut-c"><div><b>{statusCount("ongoing")}</b><span>กำลังตอก</span></div></div>
            </div>
            <div className="dl">
              {(["ongoing", "on_hand", "hold", "completed", "cancelled"] as const).map((s, i) => (
                <div key={s}><i style={{ background: `var(--s${i + 1})` }} /><span>{STATUS_LABEL[s]}</span><b>{fNum(statusCount(s))}</b><span className="p">{fNum((statusCount(s) / Math.max(1, projects.length)) * 100, 1)}%</span></div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <CardHead title="ช้ากว่าแผน" sub={`${behind.length} โครงการ · เรียงจากช้ามากที่สุด`} href="/projects?tab=ongoing" />
          {behind.length ? (
            <div className="list">
              {behind.slice(0, 5).map((p) => (
                <Link key={p.code} href={`/projects/${p.code}`} className="li" style={{ color: "inherit" }}>
                  <div className="ic" style={{ background: "var(--i-red)", color: "var(--bad-ink)" }}><Icon name="alert" /></div>
                  <div className="t"><b>{p.code} · {p.project_name}</b><span>แผน {fNum(p.plan_to_date)} · ทำได้ {fNum(p.done_qty)}</span></div>
                  <span className="dc r">{fNum(p.ahead_behind)}</span>
                </Link>
              ))}
            </div>
          ) : <Empty>ทุกโครงการเป็นไปตามแผน</Empty>}
        </div>
      </div>

      <div className="grid g12 mb">
        <div className="card span7">
          <CardHead title="เส้นทางงาน" sub="หน่วยต้น · โครงการกำลังตอก + รอเริ่ม" href="/sales" linkLabel="รายละเอียด" />
          <div className="flow">
            <div className="step"><div className="ic" style={{ background: "var(--i-green)", color: "var(--good-ink)" }}><Icon name="doc" /></div><span>ยอดสั่งซื้อสุทธิ</span><b>{fNum(flowOrd)}</b><small>{fBaht(flowVal)}</small></div><div className="arr">→</div>
            <div className="step"><div className="ic" style={{ background: "var(--i-blue)", color: "var(--s1)" }}><Icon name="crane" /></div><span>ตอกแล้ว</span><b>{fNum(flowDone)}</b><small>คงเหลือ {fNum(flowOrd - flowDone)} ต้น</small></div><div className="arr">→</div>
            <div className="step"><div className="ic" style={{ background: "var(--i-amber)", color: "var(--warn-ink)" }}><Icon name="check" /></div><span>ส่งมอบเดือนนี้</span><b>{fNum(mQ)}</b><small>{billDue} โครงการ · {fBaht(mV)}</small></div>
          </div>
          <div className="flow-sum">
            <div className="legend" style={{ justifyContent: "space-between" }}><span><i style={{ background: "var(--s1)" }} />ตอกแล้ว {fNum(flowOrd ? (flowDone / flowOrd) * 100 : 0)}% ของยอดสั่งซื้อ</span><span>คงเหลือ {fNum(flowOrd - flowDone)} ต้น</span></div>
            <div className="stack"><i style={{ width: `${flowOrd ? ((flowDone / flowOrd) * 100).toFixed(1) : 0}%`, background: "var(--s1)" }} /></div>
            {canSeeSales(user.role) && (
              <div className="minis"><div><b>{fNum(soNew)}</b>SO เปิดใหม่เดือนนี้</div><div><b>{fNum(pend)}</b>SO รออนุมัติ</div><div><b>{statusCount("on_hand")}</b>โครงการรอเริ่มตอก</div></div>
            )}
          </div>
        </div>
        <div className="card span5">
          <CardHead title="กิจกรรมล่าสุด" sub="หมายเหตุหน้างานและการนำเข้าข้อมูล" href="/daily" />
          <div className="list">
            {batches.map((b) => (
              <div key={b.created_at} className="li"><div className="ic" style={{ background: "var(--i-blue)", color: "var(--s1)" }}><Icon name="up" /></div><div className="t"><b>นำเข้า {b.file_name}: เพิ่ม {fNum(b.rows_added)} แถว</b><span>{new Date(b.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}{b.undone_at ? " · ย้อนกลับแล้ว" : ""}</span></div></div>
            ))}
            {notes.map((n) => (
              <div key={`${n.project_code}${n.note_date}`} className="li"><div className="ic" style={{ background: "var(--i-amber)", color: "var(--warn-ink)" }}><Icon name="note" /></div><div className="t"><b>{n.project_code ?? "ทั้งบริษัท"}: {n.body}</b><span>{fDate(n.note_date)} · {n.source === "manual" ? "บันทึกในเว็บ" : "Master Planning"}</span></div></div>
            ))}
            {!batches.length && !notes.length && <Empty>ยังไม่มีกิจกรรม</Empty>}
          </div>
        </div>
      </div>

      <div className="grid g12">
        <div className="card span7">
          <CardHead title="ผลงานตามจังหวัด" sub="30 วันล่าสุด (ต้น) · เทียบ 30 วันก่อนหน้า" />
          <div className="blist">
            {provs.map(([k, o]) => {
              const d = o.prev ? ((o.cur - o.prev) / o.prev) * 100 : null;
              return (
                <div key={k} className="brow"><span className="bl">{k}</span><div className="bbar"><i style={{ width: `${((o.cur / pmax) * 100).toFixed(1)}%` }} /></div><b>{fNum(o.cur)}</b>
                  <span className={`d ${d == null ? "muted" : d >= 0 ? "up" : "down"}`}>{d == null ? "ใหม่" : `${d >= 0 ? "↑" : "↓"} ${fNum(Math.abs(d))}%`}</span></div>
              );
            })}
            {!provs.length && <Empty>ไม่มีข้อมูล</Empty>}
          </div>
        </div>
        <div className="card span5">
          <CardHead title="ประเภทปั้นจั่น" sub="สัดส่วนผลงาน 30 วันล่าสุด" href="/drive" linkLabel="คิวปั้นจั่น" />
          <div className="blist">
            {rts.map(([k, v]) => (
              <div key={k} className="brow"><span className="bl">{k}</span><div className="bbar"><i style={{ width: `${((v / rtot) * 100).toFixed(1)}%`, background: "var(--s3)" }} /></div><b>{fNum(v)}</b><span className="d muted">{fNum((v / rtot) * 100)}%</span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
