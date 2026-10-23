import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAsof } from "@/lib/data";
import { addDays, dow, fDate, fNum, TH_DAYS } from "@/lib/format";
import { CardHead, Empty, Kpi, PageHeader } from "@/components/ui";
import { InlineEdit } from "@/components/InlineEdit";
import { CopyTextButton } from "@/components/CopyText";
import { setNote } from "../projects/actions";
import { DatePicker } from "./DatePicker";

export const metadata: Metadata = { title: "รายงานประจำวัน" };

const QUICK = ["ฝนตก", "น้ำท่วม", "รอพื้นที่", "เครื่องเสีย", "วันหยุด"];

export default async function DailyPage(props: PageProps<"/daily">) {
  const user = await requirePage("daily");
  const sp = await props.searchParams;
  const supabase = await createClient();
  const asof = await getAsof(supabase);
  const d = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : asof;

  const [{ data: logs }, { data: plans }, { data: notes }] = await Promise.all([
    supabase.from("drive_logs").select("project_code, rig_name, size_code, length_m, shift, qty, cubic_m, meters, leader").eq("work_date", d).gt("qty", 0).limit(1000),
    supabase.from("project_plan_days").select("project_code, planned_qty").eq("plan_date", d).limit(1000),
    supabase.from("daily_notes").select("project_code, body").eq("note_date", d).limit(1000),
  ]);
  const L = logs ?? [], PL = plans ?? [];
  const codes = [...new Set([...L.map((l) => l.project_code), ...PL.map((p) => p.project_code)])].sort();
  const { data: projs } = codes.length ? await supabase.from("projects").select("code, project_name, status").in("code", codes) : { data: [] };
  const name = new Map((projs ?? []).map((p) => [p.code, p.project_name]));
  const noteMap = new Map((notes ?? []).map((n) => [n.project_code ?? "*", n.body]));
  const planOf = (c: string) => PL.filter((p) => p.project_code === c).reduce((s, p) => s + Number(p.planned_qty), 0);
  const actOf = (c: string) => L.filter((l) => l.project_code === c).reduce((s, l) => s + Number(l.qty), 0);
  const total = L.reduce((s, l) => s + Number(l.qty), 0), planTotal = PL.reduce((s, p) => s + Number(p.planned_qty), 0);
  const co = noteMap.get("*") ?? "";
  const missed = codes.filter((c) => planOf(c) > 0 && actOf(c) === 0);

  const line = [
    `📋 สรุปผลงานตอก ${TH_DAYS[dow(d)]} ${fDate(d)}`,
    `รวม ${fNum(total)} ต้น (แผน ${fNum(planTotal, 1)}) | ${new Set(L.map((l) => l.project_code)).size} โครงการ | ${new Set(L.map((l) => l.rig_name)).size} ปั้นจั่น`,
    "",
    ...codes.filter((c) => actOf(c) > 0).sort((a, b) => actOf(b) - actOf(a)).map((c) => `• ${c} ${name.get(c) ?? ""}: ${fNum(actOf(c))} ต้น${planOf(c) ? ` (แผน ${fNum(planOf(c), 1)})` : ""}`),
    ...(missed.length ? ["", "⚠️ มีแผนแต่ไม่ได้ตอก:", ...missed.map((c) => `• ${c}${noteMap.get(c) ? ` — ${noteMap.get(c)}` : ""}`)] : []),
    ...(co ? ["", `หมายเหตุ: ${co}`] : []),
  ].join("\n");

  return (
    <>
      <PageHeader title="รายงานประจำวัน" sub="สรุปผลงานตอกของวันที่เลือก พร้อมหมายเหตุวันที่ไม่มีการตอก" readOnly={!user.canEdit}
        right={<CopyTextButton title="คัดลอกสรุปส่ง LINE" text={line} icon="line" />} />
      <div className="toolbar">
        <Link className="btn ghost sm" href={`/daily?date=${addDays(d, -1)}`}>‹ วันก่อน</Link>
        <DatePicker value={d} />
        <Link className="btn ghost sm" href={`/daily?date=${addDays(d, 1)}`}>วันถัดไป ›</Link>
        <span className="chip">{TH_DAYS[dow(d)]} {fDate(d)}</span>
        {d !== asof && <Link className="link" href="/daily">ไปวันล่าสุด ({fDate(asof)})</Link>}
      </div>
      <div className="grid g4 mb">
        <Kpi tone="blue" icon="pile" label="ตอกรวม" value={fNum(total)} unit="ต้น" cmp={<div className="cmp">แผนรวม {fNum(planTotal, 1)} ต้น</div>} />
        <Kpi tone="green" icon="plan" label="โครงการที่ทำงาน" value={new Set(L.map((l) => l.project_code)).size} cmp={<div className="cmp">มีแผน {new Set(PL.map((p) => p.project_code)).size} โครงการ</div>} />
        <Kpi tone="amber" icon="crane" label="ปั้นจั่นที่ทำงาน" value={new Set(L.map((l) => l.rig_name)).size}
          cmp={<div className="cmp">คิว {fNum(L.reduce((s, l) => s + Number(l.cubic_m), 0), 1)} ลบ.ม. · {fNum(L.reduce((s, l) => s + Number(l.meters), 0))} ม.</div>} />
        <div className="card kpi-card t-red">
          <div className="kpi"><div className="ic red">!</div>
            <div style={{ minWidth: 0, flex: 1 }}><div className="lbl">หมายเหตุทั้งบริษัท</div>
              <div style={{ marginTop: 4 }}><InlineEdit key={`co${d}`} canEdit={user.canEdit} value={co} placeholder="+ เช่น น้ำท่วม / ฝนตกหนัก" quick={QUICK} onSave={setNote.bind(null, null, d)} /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <CardHead title="รายโครงการ" sub="คลิกรหัสโครงการเพื่อดูแผนเทียบผลงาน" />
        {codes.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>โครงการ</th><th className="num">แผน</th><th className="num">ทำจริง</th><th className="num">ต่าง</th><th>ปั้นจั่น / ขนาด / กะ</th><th style={{ minWidth: 200 }}>หมายเหตุ</th></tr></thead>
              <tbody>
                {codes.map((c) => {
                  const pv = planOf(c), av = actOf(c), note = noteMap.get(c) ?? "";
                  return (
                    <tr key={c} className={av === 0 && pv > 0 ? (note ? "noday" : "missing") : ""}>
                      <td><Link href={`/projects/${c}`} className="code">{c}</Link><span className="cell-sub">{name.get(c)}</span></td>
                      <td className="num">{pv ? fNum(pv, 1) : "–"}</td>
                      <td className="num"><b>{av ? fNum(av, 1) : "–"}</b></td>
                      <td className="num">{pv || av ? <span className={av - pv >= 0 ? "up" : "down"}>{av - pv >= 0 ? "+" : ""}{fNum(av - pv, 1)}</span> : null}</td>
                      <td>{L.filter((l) => l.project_code === c).map((l, i) => <span key={i} className="pill"><b>{l.rig_name}</b> {l.size_code} · {fNum(l.length_m, 1)}ม. <span className={`shift ${l.shift}`}>{l.shift}</span> <b>{fNum(l.qty)}</b></span>)}</td>
                      <td><InlineEdit key={`${c}${d}`} canEdit={user.canEdit} value={note} placeholder={av === 0 && pv > 0 ? "+ ระบุเหตุผลที่ไม่ได้ตอก" : "+ หมายเหตุ"} quick={QUICK} onSave={setNote.bind(null, c, d)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>ไม่มีแผนและผลงานในวันนี้</Empty>}
      </div>
    </>
  );
}
