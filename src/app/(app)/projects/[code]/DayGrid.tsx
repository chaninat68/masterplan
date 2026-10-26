"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, dayRange, dow, fDate, fNum, TH_DAYS } from "@/lib/format";
import { InlineEdit } from "@/components/InlineEdit";
import { Icon } from "@/components/Icon";
import { addManualLog, deleteManualLog, setNote, setPlanDay } from "../actions";

export type DayLog = {
  id: number; work_date: string; rig_name: string; rig_type: string; size_code: string; length_m: number | null;
  shift: string; qty: number; leader: string; company_raw: string; source: string;
};
type Status = "ok" | "part" | "miss" | "off" | "extra" | "fut" | "none";
const ST: Record<Status, [string, string]> = {
  ok: ["ถึงแผน", "g"], part: ["ไม่ถึงแผน", "a"], miss: ["มีแผนแต่ไม่ได้ตอก", "r"], off: ["หยุด (มีหมายเหตุ)", "n"],
  extra: ["ตอกนอกแผน", "g"], fut: ["แผนล่วงหน้า", "n"], none: ["ไม่มีแผน", "n"],
};
const QUICK = ["ฝนตก", "น้ำท่วม", "รอพื้นที่", "เครื่องเสีย", "วันหยุด", "รอใบอนุญาต", "ลูกค้าสั่งหยุด"];

export function DayGrid(props: {
  code: string; asof: string; canEdit: boolean; finished: boolean; orderQty: number;
  plan: Record<string, number>; actual: Record<string, number>;
  notes: Record<string, string>; coNotes: Record<string, string>; logs: DayLog[];
}) {
  const { code, asof, plan, actual, notes, coNotes, canEdit } = props;
  const router = useRouter();
  const [pending, start] = useTransition();

  const keys = [...Object.keys(plan), ...Object.keys(actual), ...Object.keys(notes)].sort();
  const pastKeys = keys.filter((d) => d <= asof);
  const [sel, setSel] = useState(pastKeys[pastKeys.length - 1] ?? asof);

  const byDay = new Map<string, DayLog[]>();
  for (const l of props.logs) byDay.set(l.work_date, [...(byDay.get(l.work_date) ?? []), l]);
  const noteOf = (d: string) => notes[d] || coNotes[d] || "";
  const status = (d: string): Status => {
    const pv = plan[d] ?? 0, av = actual[d] ?? 0;
    if (d > asof) return pv ? "fut" : "none";
    if (av > 0) return pv ? (av >= pv ? "ok" : "part") : "extra";
    if (noteOf(d)) return "off";
    return pv ? "miss" : "none";
  };

  // ตารางแนวนอนทั้งโครงการ (รูปแบบเดียวกับ Excel: วันที่ / แผนงาน / ผลงาน / ผลงานสะสม / % การทำงาน)
  const workKeys = [...Object.keys(plan), ...Object.keys(actual)].sort();
  const days = dayRange(workKeys[0] ?? asof, workKeys[workKeys.length - 1] ?? asof);
  const cum: Record<string, number> = {};
  let run = 0;
  for (const x of days) {
    if (x > asof) break;
    run += actual[x] ?? 0;
    cum[x] = run;
  }
  const tPlan = days.reduce((t, x) => t + (plan[x] ?? 0), 0);
  const lastPast = [...days].reverse().find((x) => x <= asof);
  const pct = (x: string) => (props.orderQty > 0 && cum[x] != null ? (cum[x] / props.orderQty) * 100 : null);
  const lastPct = lastPast ? pct(lastPast) : null;
  const selRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    const th = selRef.current, wrap = th?.closest(".ptbl-wrap");
    if (th && wrap) wrap.scrollLeft = th.offsetLeft - wrap.clientWidth / 2;
  }, []);
  const pick = setSel;

  // รายละเอียดวันที่เลือก
  const d = sel, pv = plan[d] ?? 0, av = actual[d] ?? 0, st = status(d), past = d <= asof, ls = byDay.get(d) ?? [];
  const [stL, stC] = ST[st];
  const [form, setForm] = useState({ rig: "", size: "", length: "", shift: "A", qty: "" });
  const [err, setErr] = useState("");
  function addLog() {
    start(async () => {
      const r = await addManualLog({ code, date: d, rig: form.rig, size: form.size, length: Number(form.length || 0), shift: form.shift as "A" | "B", qty: Number(form.qty) });
      if (!r.ok) setErr(r.error);
      else { setErr(""); setForm({ ...form, qty: "" }); router.refresh(); }
    });
  }
  function delLog(id: number) {
    if (!confirm("ลบรายการตอกที่บันทึกเองนี้?")) return;
    start(async () => { await deleteManualLog(code, id); router.refresh(); });
  }

  return (
    <div className={pending ? "busy" : ""}>
      <div className="sec-h">
        <span className="muted">{canEdit ? "คลิกวันเพื่อดูรายละเอียด และแก้แผน / ผลงาน / หมายเหตุ" : "คลิกวันเพื่อดูรายละเอียด"}</span>
        <span className="grow" />
      </div>
      <div className="cal-legend">
        <span><i style={{ background: "var(--good-soft)" }} />ถึงแผน</span><span><i style={{ background: "var(--warn-soft)" }} />ไม่ถึงแผน</span>
        <span><i style={{ background: "var(--bad-soft)" }} />มีแผนแต่ไม่ได้ตอก</span>
        <span><i style={{ background: "repeating-linear-gradient(135deg,var(--surface-3) 0 3px,var(--surface) 3px 6px)" }} />หยุด (มีหมายเหตุ)</span>
        <span><i style={{ background: "var(--warn)", borderRadius: "50%", width: 8, height: 8 }} />มีหมายเหตุ</span>
      </div>

      <div className="ptbl-wrap">
        <table className="ptbl">
          <thead>
            <tr>
              <th className="lab">วันที่</th>
              {days.map((x) => (
                <th key={x} ref={x === sel ? selRef : undefined} className={`${x === sel ? "sel" : ""} ${x === asof ? "today" : ""} ${dow(x) === 0 ? "sun" : ""} ${x.endsWith("-01") ? "m1" : ""}`} onClick={() => pick(x)} title={fDate(x)}>
                  {Number(x.slice(8))}/{Number(x.slice(5, 7))}<small>{TH_DAYS[dow(x)]}</small>{noteOf(x) && <i className="ni" />}
                </th>
              ))}
              <th className="tot">รวม</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="lab">แผนงาน</th>
              {days.map((x) => <td key={x} className={x === sel ? "sel" : ""} onClick={() => pick(x)}>{plan[x] ? fNum(plan[x], 1) : ""}</td>)}
              <td className="tot">{fNum(tPlan, 1)}</td>
            </tr>
            <tr>
              <th className="lab">ผลงาน</th>
              {days.map((x) => {
                const s = status(x);
                return <td key={x} className={`st-${s} ${x === sel ? "sel" : ""}`} onClick={() => pick(x)} title={noteOf(x)}>
                  {x > asof ? "" : actual[x] ? fNum(actual[x], 1) : s === "miss" ? "0" : s === "off" ? "หยุด" : ""}
                </td>;
              })}
              <td className="tot">{lastPast ? fNum(cum[lastPast], 1) : "–"}</td>
            </tr>
            <tr>
              <th className="lab">ผลงานสะสม</th>
              {days.map((x) => <td key={x} className={x === sel ? "sel" : ""} onClick={() => pick(x)}>{cum[x] != null ? fNum(cum[x], 1) : ""}</td>)}
              <td className="tot">{lastPast ? fNum(cum[lastPast], 1) : "–"}</td>
            </tr>
            <tr>
              <th className="lab">% การทำงาน</th>
              {days.map((x) => { const v = pct(x); return <td key={x} className={`pc ${x === sel ? "sel" : ""}`} onClick={() => pick(x)}>{v != null ? `${fNum(v)}%` : ""}</td>; })}
              <td className="tot">{lastPct != null ? `${fNum(lastPct)}%` : "–"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>% การทำงาน = ผลงานสะสม ÷ ยอดสั่งซื้อ {fNum(props.orderQty)} ต้น</div>

      <div className="daypanel">
        <div className="card-h" style={{ marginBottom: 6 }}>
          <div><h3>{TH_DAYS[dow(d)]} {fDate(d)}</h3><div className="sub">{d === asof ? "วันล่าสุดที่มีข้อมูล" : past ? "ผลงานที่ผ่านมา" : "แผนล่วงหน้า"}</div></div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn ghost sm" onClick={() => pick(addDays(d, -1))}>‹ วันก่อน</button>
            <button className="btn ghost sm" onClick={() => pick(addDays(d, 1))}>วันถัดไป ›</button>
          </div>
        </div>
        <div className="dp-grid">
          <div><label>แผน</label><InlineEdit key={`p${d}`} canEdit={canEdit} type="number" width={90} value={pv ? String(pv) : ""} display={pv ? fNum(pv, 1) : "–"} onSave={(v) => setPlanDay(code, d, v)} /> <small className="muted">ต้น</small></div>
          <div><label>ทำจริง (จากคิว-วัน)</label>{past ? <>{fNum(av, 1)} <small className="muted">ต้น</small></> : <span className="muted">–</span>}</div>
          <div><label>ต่างจากแผน</label>{past && (pv || av) ? <><span className={av - pv >= 0 ? "up" : "down"}>{av - pv >= 0 ? "+" : ""}{fNum(av - pv, 1)}</span>{pv ? <small className="muted"> ({fNum((av / pv) * 100)}%)</small> : null}</> : <span className="muted">–</span>}</div>
          <div><label>สถานะ</label><span className={`dc ${stC}`}>{stL}</span></div>
        </div>
        {ls.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>รายละเอียดการตอก</label>
            {ls.map((l) => (
              <span key={l.id} className="pill" title={`${l.company_raw} · ${l.rig_type}`}>
                <b>{l.rig_name}</b> {l.size_code} · {fNum(l.length_m, 1)}ม. <span className={`shift ${l.shift}`}>{l.shift}</span> <b>{fNum(l.qty)}</b> ต้น{l.leader ? ` · ${l.leader}` : ""}
                {l.source === "manual" && <> ✦{canEdit && <button className="link" style={{ marginLeft: 6 }} onClick={() => delLog(l.id)} title="ลบ"><Icon name="trash" size={13} /></button>}</>}
              </span>
            ))}
          </div>
        )}
        <div style={{ marginBottom: canEdit && past ? 12 : 0 }}>
          <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>หมายเหตุ {st === "miss" && <span className="down">— ควรระบุเหตุผลที่ไม่ได้ตอก</span>}</label>
          <InlineEdit key={`n${d}`} canEdit={canEdit} value={notes[d] ?? ""} placeholder="+ เพิ่มหมายเหตุ เช่น ฝนตก น้ำท่วม รอพื้นที่" quick={QUICK} onSave={(v) => setNote(code, d, v)} />
          {coNotes[d] && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>ทั้งบริษัท: {coNotes[d]}</div>}
        </div>
        {canEdit && past && (
          <details>
            <summary className="link" style={{ cursor: "pointer" }}>+ บันทึกยอดตอกเอง (กรณีไม่มีในไฟล์คิว-วัน)</summary>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <input className="input" placeholder="ชื่อปั้นจั่น" value={form.rig} onChange={(e) => setForm({ ...form, rig: e.target.value })} style={{ width: 130 }} />
              <input className="input" placeholder="ขนาด เช่น IP26A" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} style={{ width: 130 }} />
              <input className="input" placeholder="ยาว (ม.)" type="number" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} style={{ width: 90 }} />
              <select className="input" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}><option>A</option><option>B</option></select>
              <input className="input" placeholder="จำนวนต้น" type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={{ width: 100 }} />
              <button className="btn sm" disabled={pending} onClick={addLog}><Icon name="plus" />บันทึก</button>
            </div>
            {err && <div className="form-err">{err}</div>}
          </details>
        )}
      </div>
    </div>
  );
}

