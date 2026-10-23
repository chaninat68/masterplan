"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, dayRange, dow, fDate, fDateShort, fNum, TH_DAYS, TH_MONTHS, weekStart } from "@/lib/format";
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
  code: string; asof: string; canEdit: boolean; finished: boolean;
  plan: Record<string, number>; actual: Record<string, number>;
  notes: Record<string, string>; coNotes: Record<string, string>; logs: DayLog[];
}) {
  const { code, asof, plan, actual, notes, coNotes, canEdit } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fullPast, setFullPast] = useState(false);
  const [fullFut, setFullFut] = useState(false);

  const keys = [...Object.keys(plan), ...Object.keys(actual), ...Object.keys(notes)].sort();
  const first = keys[0] ?? asof;
  const lastPlan = props.finished ? undefined : Object.keys(plan).filter((d) => d > asof).sort().pop();
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

  const curW = weekStart(asof);
  const startW = fullPast ? weekStart(first) : [weekStart(addDays(asof, -20)), weekStart(first)].sort()[1];
  const futEndW = lastPlan ? weekStart(lastPlan) : curW;
  const endW = fullFut ? futEndW : [futEndW, addDays(curW, 21)].sort()[0];
  const weeks: string[] = [];
  for (let w = [startW, endW].sort()[0]; w <= endW; w = addDays(w, 7)) weeks.push(w);
  const morePast = weekStart(first) < startW, moreFut = futEndW > endW;

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
        {(morePast || fullPast) && <button className="btn ghost sm" onClick={() => setFullPast(!fullPast)}>{fullPast ? "ย่อย้อนหลัง" : "ย้อนหลังทั้งหมด"}</button>}
        {(moreFut || fullFut) && <button className="btn ghost sm" onClick={() => setFullFut(!fullFut)}>{fullFut ? "ย่อแผนล่วงหน้า" : "แผนล่วงหน้าทั้งหมด"}</button>}
      </div>
      <div className="cal-legend">
        <span><i style={{ background: "var(--good-soft)" }} />ถึงแผน</span><span><i style={{ background: "var(--warn-soft)" }} />ไม่ถึงแผน</span>
        <span><i style={{ background: "var(--bad-soft)" }} />มีแผนแต่ไม่ได้ตอก</span>
        <span><i style={{ background: "repeating-linear-gradient(135deg,var(--surface-3) 0 3px,var(--surface) 3px 6px)" }} />หยุด (มีหมายเหตุ)</span>
        <span><i style={{ borderStyle: "dashed" }} />แผนล่วงหน้า</span>
        <span><i style={{ background: "var(--warn)", borderRadius: "50%", width: 8, height: 8 }} />มีหมายเหตุ</span>
      </div>

      <div className="wgrid">
        <div className="wh blank" />
        {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((h) => <div key={h} className="wh">{h}</div>)}
        {weeks.map((w) => {
          const ds = dayRange(w, addDays(w, 6));
          const wp = ds.reduce((s, x) => s + (plan[x] ?? 0), 0);
          const wpPast = ds.reduce((s, x) => s + (x <= asof ? plan[x] ?? 0 : 0), 0);
          const wa = ds.reduce((s, x) => s + (x <= asof ? actual[x] ?? 0 : 0), 0);
          const rate = wpPast ? (wa / wpPast) * 100 : null;
          return [
            <div key={w} className={`wl ${w === curW ? "cur" : ""}`}>
              <span>{fDateShort(w)} – {fDateShort(addDays(w, 6))}{w === curW ? " · สัปดาห์นี้" : ""}</span>
              <b>แผน {fNum(wp, 1)}{w <= asof ? ` · ทำ ${fNum(wa, 1)}` : ""}</b>
              {rate != null && <em className={rate >= 100 ? "up" : rate >= 80 ? "tag-warn" : "down"}>{fNum(rate)}% ของแผน</em>}
            </div>,
            ...ds.map((x) => {
              const xp = plan[x] ?? 0, xa = actual[x] ?? 0, s = status(x), note = noteOf(x), xpast = x <= asof;
              const r = xp ? Math.min(1, xa / xp) : xa ? 1 : 0;
              const dn = Number(x.slice(8)) === 1 ? `1 ${TH_MONTHS[Number(x.slice(5, 7)) - 1]}` : Number(x.slice(8));
              return (
                <button key={x} className={`dc2 ${s} ${x === sel ? "sel" : ""} ${x === asof ? "today" : ""}`} onClick={() => setSel(x)}
                  title={`${fDate(x)} · แผน ${fNum(xp, 1)}${xpast ? ` · ทำจริง ${fNum(xa, 1)}` : ""}${note ? ` · ${note}` : ""}`}>
                  <span className="dn">{dn}</span>
                  {note && <i className="ni" />}
                  {xpast ? (xp || xa ? (<><span className="pl">แผน {xp ? fNum(xp, 1) : "–"}</span><span className="ac">{xa ? fNum(xa, 1) : "0"}</span><span className="mb"><i style={{ width: `${(r * 100).toFixed(0)}%` }} /></span></>)
                    : note ? <span className="pl" style={{ marginTop: "auto" }}>หยุด</span> : null)
                    : xp ? (<><span className="pl">แผน</span><span className="ac">{fNum(xp, 1)}</span></>) : null}
                </button>
              );
            }),
          ];
        })}
      </div>

      <div className="daypanel">
        <div className="card-h" style={{ marginBottom: 6 }}>
          <div><h3>{TH_DAYS[dow(d)]} {fDate(d)}</h3><div className="sub">{d === asof ? "วันล่าสุดที่มีข้อมูล" : past ? "ผลงานที่ผ่านมา" : "แผนล่วงหน้า"}</div></div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn ghost sm" onClick={() => setSel(addDays(d, -1))}>‹ วันก่อน</button>
            <button className="btn ghost sm" onClick={() => setSel(addDays(d, 1))}>วันถัดไป ›</button>
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
