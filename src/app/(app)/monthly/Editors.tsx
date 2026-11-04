"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { STATUS_COLS, SERVICE_ROWS, type Delivery, type Issue, type StatusData, type StatusGrid } from "@/lib/planningMeeting";
import { createMeeting, deleteMeeting, importDeliveryFile, importStatusFile, saveSection, type Section } from "./actions";

const toNum = (s: string): number | null => {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const show = (n: number | null | undefined) => (n == null ? "" : String(n));

/** state ของฟอร์มที่ตามข้อมูลจากเซิร์ฟเวอร์ (เช่น หลังนำเข้าไฟล์) — ไม่งั้นกดบันทึกจะเอาค่าเก่าทับ */
function useSynced<T>(data: T) {
  const sig = JSON.stringify(data);
  const [state, setState] = useState<T>(data);
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) { setSeen(sig); setState(data); }
  return [state, setState] as const;
}

function useSave(id: string, section: Section) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const save = (data: unknown, after?: () => void) =>
    start(async () => {
      const r = await saveSection(id, section, data);
      if (r.ok) { setMsg({ ok: true, text: "บันทึกแล้ว" }); router.refresh(); after?.(); } else setMsg({ ok: false, text: r.error });
    });
  return { pending, msg, save };
}

/** กรอบแก้ไขใต้สไลด์ — กดเปิดเมื่อจะกรอก */
function Panel({ label = "แก้ไขข้อมูล", children, actions }: { label?: string; children: (close: () => void) => ReactNode; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <div className="pm-edit-bar">
        <button className="btn ghost sm" type="button" onClick={() => setOpen(true)}><Icon name="note" size={15} />{label}</button>
        {actions}
      </div>
    );
  return <div className="pm-edit">{children(() => setOpen(false))}</div>;
}

function Foot({ pending, msg, onSave, onCancel, extra }: { pending: boolean; msg: { ok: boolean; text: string } | null; onSave: () => void; onCancel: () => void; extra?: ReactNode }) {
  return (
    <div className="pm-edit-foot">
      {extra}
      <span style={{ flex: 1 }} />
      {msg && <span className={msg.ok ? "ok-msg" : "err"}>{msg.text}</span>}
      <button className="btn ghost sm" type="button" onClick={onCancel}>ปิด</button>
      <button className="btn sm" type="button" disabled={pending} onClick={onSave}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
    </div>
  );
}

const NumIn = ({ value, onChange, w = 84, step }: { value: number | null; onChange: (v: number | null) => void; w?: number; step?: string }) => (
  <input className="input num" inputMode="decimal" type="number" step={step ?? "any"} style={{ width: w }} value={show(value)} onChange={(e) => onChange(toNum(e.target.value))} />
);

/* ---------- สร้าง / ลบ ครั้งประชุม ---------- */
export function NewMeeting({ defaultDate, defaultAsof }: { defaultDate: string; defaultAsof: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button className="btn sm" type="button" onClick={() => setOpen(true)}><Icon name="plus" />สร้างประชุมเดือนใหม่</button>;
  return (
    <form className="add-item" onSubmit={(e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget)) as { meeting_date: string; status_asof: string };
      start(async () => {
        const r = await createMeeting(f);
        if (r.ok) { setOpen(false); router.push(`/monthly?m=${f.meeting_date}`); router.refresh(); } else setErr(r.error);
      });
    }}>
      <label className="pm-lbl">วันประชุม <input className="input" type="date" name="meeting_date" defaultValue={defaultDate} required /></label>
      <label className="pm-lbl">ข้อมูลสถานะ ณ วันที่ <input className="input" type="date" name="status_asof" defaultValue={defaultAsof} required /></label>
      <button className="btn sm" disabled={pending}>{pending ? "กำลังสร้าง…" : "สร้าง"}</button>
      <button className="btn ghost sm" type="button" onClick={() => setOpen(false)}>ยกเลิก</button>
      {err && <span className="err">{err}</span>}
    </form>
  );
}

export function DeleteMeeting({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="btn ghost sm" type="button" disabled={pending} onClick={() => {
      if (!confirm(`ลบข้อมูลประชุม ${label} ทั้งหมด?`)) return;
      start(async () => { const r = await deleteMeeting(id); if (r.ok) { router.push("/monthly"); router.refresh(); } else alert(r.error); });
    }}><Icon name="trash" size={15} />ลบครั้งประชุมนี้</button>
  );
}

/* ---------- หัวเรื่อง / วันที่ข้อมูล / สรุปท้าย ---------- */
export function MetaEditor({ id, title, statusAsof, notes }: { id: string; title: string; statusAsof: string; notes: string }) {
  const [s, setS] = useSynced({ title, status_asof: statusAsof, notes });
  const { pending, msg, save } = useSave(id, "meta");
  return (
    <Panel label="แก้หัวเรื่อง / วันที่ข้อมูล / สรุปท้าย">
      {(close) => (
        <>
          <div className="pm-form">
            <label className="pm-lbl">หัวเรื่อง <input className="input" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></label>
            <label className="pm-lbl">ข้อมูลสถานะ ณ วันที่ (Update) <input className="input" type="date" value={s.status_asof} onChange={(e) => setS({ ...s, status_asof: e.target.value })} /></label>
          </div>
          <label className="pm-lbl block">สรุป / สิ่งที่ขอให้ที่ประชุมรับทราบ (1 บรรทัด = 1 ข้อ)
            <textarea className="input" rows={5} value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} />
          </label>
          <Foot pending={pending} msg={msg} onCancel={close} onSave={() => save(s)} />
        </>
      )}
    </Panel>
  );
}

/* ---------- 01 สถานะโครงการ (จำนวน / มูลค่า) ---------- */
export function StatusEditor({ id, section, data, labels, suggest, unit }: {
  id: string; section: "status_counts" | "status_values"; data: StatusData; labels: { cur: string; prev: string };
  suggest: number[]; unit: string;
}) {
  const [d, setD] = useSynced<StatusData>(data);
  const { pending, msg, save } = useSave(id, section);
  const set = (which: "cur" | "prev", row: keyof StatusGrid, i: number, v: number | null) =>
    setD((o) => ({ ...o, [which]: { ...o[which], [row]: o[which][row].map((x, k) => (k === i ? v : x)) } }));
  const grid = (which: "cur" | "prev") => (
    <div className="tbl-wrap">
      <table className="pm-in">
        <thead><tr><th>{which === "cur" ? labels.cur : labels.prev} ({unit})</th>{STATUS_COLS.map((c) => <th key={c.key}>{c.short}</th>)}</tr></thead>
        <tbody>
          {SERVICE_ROWS.map((r) => (
            <tr key={r.key}><td>{r.label}</td>
              {STATUS_COLS.map((c, i) => <td key={c.key}><NumIn value={d[which][r.key][i]} onChange={(v) => set(which, r.key, i, v)} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <Panel actions={<ImportStatus id={id} expect={labels.cur} />}>
      {(close) => (
        <>
          <p className="pm-hint">กรอกตามข้อมูลสถานะโครงการ ณ วันที่อัพเดท · ช่องว่าง = 0 · Potential (รอลูกค้าตัดสินใจ) ระบบไม่มีข้อมูล ต้องกรอกเอง</p>
          {grid("cur")}
          {grid("prev")}
          <Foot pending={pending} msg={msg} onCancel={close} onSave={() => save(d)}
            extra={
              <button className="btn ghost sm" type="button" title="เติมแถวพร้อมตอกของปีนี้จากโครงการในระบบ (ยกเว้น Potential)"
                onClick={() => setD((o) => ({ ...o, cur: { ...o.cur, ready: o.cur.ready.map((x, i) => (i === 3 ? x : suggest[i])) } }))}>
                <Icon name="dl" size={15} />เติม &quot;พร้อมตอก&quot; จากระบบ
              </button>
            } />
        </>
      )}
    </Panel>
  );
}

/** นำเข้าไฟล์ "ทำข้อมูลสถานะโครงการ.xlsx" → เติมทั้งสไลด์จำนวนและมูลค่า */
function ImportStatus({ id, expect }: { id: string; expect: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <>
      <label className={`btn ghost sm${pending ? " disabled" : ""}`} title="ไฟล์ที่มีตาราง จำนวนโครงการ และ มูลค่า (Completed / Ongoing / On Hand / Potential / Hold)">
        <Icon name="up" size={15} />{pending ? "กำลังนำเข้า…" : "นำเข้าจาก Excel"}
        <input type="file" accept=".xlsx,.xls" hidden disabled={pending} onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const fd = new FormData();
          fd.append("file", f);
          start(async () => {
            const r = await importStatusFile(id, fd);
            if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
            const got = r.labels?.cur ?? "";
            const warn = got && got.replace(/\s/g, "") !== expect.replace(/\s/g, "") ? ` · ⚠ ไฟล์เป็นข้อมูล ${got} แต่ประชุมนี้แสดง ${expect} (ตรวจวันที่ Update ที่หน้าปก)` : "";
            setMsg({ ok: !warn, text: `นำเข้าแล้ว: ${got}${r.labels?.prev ? " เทียบ " + r.labels.prev : ""} (จำนวน + มูลค่า)${warn}` });
            router.refresh();
          });
        }} />
      </label>
      {msg && <span className={msg.ok ? "ok-msg" : "err"} style={{ alignSelf: "center" }}>{msg.text}</span>}
    </>
  );
}

/** นำเข้าไฟล์ "นำเข้าอัตราการใช้.xlsx" → เติมสไลด์แผนการจัดส่ง (ประเภทก่อสร้าง + 5 ผลิตภัณฑ์) */
function ImportDelivery({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <>
      <label className={`btn ghost sm${pending ? " disabled" : ""}`} title="ไฟล์ที่มีตาราง ประเภทการก่อสร้าง / 5 ผลิตภัณฑ์ (คอลัมน์ จำนวนต้น และ ลบ.ม.) + แถว เฉลี่ย/วัน">
        <Icon name="up" size={15} />{pending ? "กำลังนำเข้า…" : "นำเข้าจาก Excel"}
        <input type="file" accept=".xlsx,.xls" hidden disabled={pending} onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const fd = new FormData();
          fd.append("file", f);
          start(async () => {
            const r = await importDeliveryFile(id, fd);
            setMsg(r.ok ? { ok: true, text: `นำเข้าแล้ว: ${r.summary ?? ""}` } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          });
        }} />
      </label>
      {msg && <span className={msg.ok ? "ok-msg" : "err"} style={{ alignSelf: "center" }}>{msg.text}</span>}
    </>
  );
}

/* ---------- โครงการมีปัญหา ---------- */
export type ProjectHint = { code: string; customer: string; project: string; value: number; outstanding: number; remain_qty: number; note: string; hold: boolean };
const blankIssue = (): Issue => ({ code: "", customer: "", project: "", issue: "", detail: "", value: null, outstanding: "", remain_qty: null, timeline: "" });
const r2 = (n: number) => Math.round(n * 100) / 100;
function fromProject(p: ProjectHint, base: Issue = blankIssue()): Issue {
  return {
    ...base, code: p.code, customer: base.customer || p.customer, project: base.project || p.project,
    value: base.value ?? r2(p.value / 1e6), outstanding: base.outstanding || r2(p.outstanding / 1e6).toFixed(2),
    remain_qty: base.remain_qty ?? p.remain_qty, issue: base.issue || p.note,
  };
}

export function IssuesEditor({ id, data, projects }: { id: string; data: Issue[]; projects: ProjectHint[] }) {
  const [rows, setRows] = useSynced<Issue[]>(data);
  const { pending, msg, save } = useSave(id, "issues");
  const byCode = new Map(projects.map((p) => [p.code, p]));
  const upd = (i: number, patch: Partial<Issue>) => setRows((o) => o.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => setRows((o) => { const a = [...o]; const j = i + d; if (j < 0 || j >= a.length) return o; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const addHold = () => setRows((o) => {
    const have = new Set(o.map((r) => r.code));
    return [...o, ...projects.filter((p) => p.hold && !have.has(p.code)).map((p) => fromProject(p))];
  });
  return (
    <Panel label="แก้รายการโครงการมีปัญหา">
      {(close) => (
        <>
          <p className="pm-hint">พิมพ์รหัสโครงการแล้วระบบเติมลูกค้า / โครงการ / มูลค่า / คงค้าง / คงเหลือให้ (แก้ได้) · มูลค่าหน่วยล้านบาท · คงค้างพิมพ์ข้อความได้ เช่น &quot;ลูกค้าจ่ายเงินครบแล้ว&quot;</p>
          <datalist id="pm-codes">{projects.map((p) => <option key={p.code} value={p.code}>{p.customer} · {p.project}</option>)}</datalist>
          <div className="pm-issues-edit">
            {rows.map((r, i) => (
              <div className="pm-issue-row" key={i}>
                <div className="pm-issue-no">{i + 1}</div>
                <div className="pm-issue-fields">
                  <input className="input" list="pm-codes" placeholder="รหัสโครงการ" value={r.code} style={{ width: 120 }}
                    onChange={(e) => { const c = e.target.value.trim().toUpperCase(); const p = byCode.get(c); upd(i, p ? fromProject(p, { ...r, code: c }) : { code: e.target.value }); }} />
                  <input className="input" placeholder="ลูกค้า" value={r.customer} onChange={(e) => upd(i, { customer: e.target.value })} />
                  <input className="input wide" placeholder="โครงการ" value={r.project} onChange={(e) => upd(i, { project: e.target.value })} />
                  <input className="input wide" placeholder="ปัญหา / สถานะ เช่น รอเคลียร์พื้นที่" value={r.issue} onChange={(e) => upd(i, { issue: e.target.value })} />
                  <input className="input wide" placeholder="รายละเอียดเสาคงเหลือ เช่น สต๊อกค้าง SS22 x 14 m. = 16 ต้น" value={r.detail} onChange={(e) => upd(i, { detail: e.target.value })} />
                  <label className="pm-lbl">มูลค่า (ล้าน)<NumIn value={r.value} onChange={(v) => upd(i, { value: v })} /></label>
                  <label className="pm-lbl">คงค้าง (ล้าน)<input className="input" style={{ width: 150 }} value={r.outstanding} onChange={(e) => upd(i, { outstanding: e.target.value })} /></label>
                  <label className="pm-lbl">คงเหลือ (ต้น)<NumIn value={r.remain_qty} onChange={(v) => upd(i, { remain_qty: v })} /></label>
                  <label className="pm-lbl">Timeline<input className="input" style={{ width: 150 }} placeholder="เช่น 15 พ.ย. 69" value={r.timeline} onChange={(e) => upd(i, { timeline: e.target.value })} /></label>
                </div>
                <div className="pm-issue-act">
                  <button className="icon-btn sm" type="button" title="ขึ้น" onClick={() => move(i, -1)}>▲</button>
                  <button className="icon-btn sm" type="button" title="ลง" onClick={() => move(i, 1)}>▼</button>
                  <button className="icon-btn sm" type="button" title="ลบ" onClick={() => setRows((o) => o.filter((_, k) => k !== i))}><Icon name="trash" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
          <Foot pending={pending} msg={msg} onCancel={close} onSave={() => save(rows)}
            extra={<>
              <button className="btn ghost sm" type="button" onClick={() => setRows((o) => [...o, blankIssue()])}><Icon name="plus" size={15} />เพิ่มแถว</button>
              <button className="btn ghost sm" type="button" onClick={addHold}><Icon name="dl" size={15} />เพิ่มโครงการ Hold จากระบบ</button>
            </>} />
        </>
      )}
    </Panel>
  );
}

/* ---------- 03 แผนการจัดส่ง ---------- */
export function DeliveryEditor({ id, data, suggestPiles }: { id: string; data: Delivery; suggestPiles: Record<string, number> }) {
  const [d, setD] = useSynced<Delivery>(data);
  const { pending, msg, save } = useSave(id, "delivery");
  const updT = (i: number, p: Partial<Delivery["by_type"][number]>) => setD((o) => ({ ...o, by_type: o.by_type.map((r, k) => (k === i ? { ...r, ...p } : r)) }));
  const updP = (i: number, p: Partial<Delivery["products"][number]>) => setD((o) => ({ ...o, products: o.products.map((r, k) => (k === i ? { ...r, ...p } : r)) }));
  return (
    <Panel label="แก้แผนการจัดส่ง" actions={<ImportDelivery id={id} />}>
      {(close) => (
        <>
          <p className="pm-hint">ลบ.ม. = หน้าตัด (ตร.ซม.) × ความยาว (ม.) × จำนวนต้น ÷ 10,000 · ปุ่ม &quot;เติมจำนวนต้นจากแผนตอก&quot; รวมเฉพาะโครงการพร้อมตอกที่มีแผนในระบบ (ไม่รวมงานส่งอย่างเดียว)</p>
          <div className="pm-form">
            <label className="pm-lbl">อัตราการใช้ (ลบ.ม./วัน)<NumIn value={d.rate} onChange={(v) => setD({ ...d, rate: v })} w={110} /></label>
          </div>
          <div className="pm-two">
            <div className="tbl-wrap">
              <table className="pm-in">
                <thead><tr><th>ประเภทการก่อสร้าง</th><th>ลบ.ม.</th><th>จำนวนต้น</th><th /></tr></thead>
                <tbody>
                  {d.by_type.map((r, i) => (
                    <tr key={i}>
                      <td><input className="input" value={r.type} onChange={(e) => updT(i, { type: e.target.value })} style={{ width: 130 }} /></td>
                      <td><NumIn value={r.m3} onChange={(v) => updT(i, { m3: v })} w={96} /></td>
                      <td><NumIn value={r.piles} onChange={(v) => updT(i, { piles: v })} w={96} /></td>
                      <td><button className="icon-btn sm" type="button" title="ลบ" onClick={() => setD((o) => ({ ...o, by_type: o.by_type.filter((_, k) => k !== i) }))}><Icon name="trash" size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pm-row-btns">
                <button className="btn ghost sm" type="button" onClick={() => setD((o) => ({ ...o, by_type: [...o.by_type, { type: "", m3: null, piles: null }] }))}><Icon name="plus" size={15} />เพิ่มประเภท</button>
                <button className="btn ghost sm" type="button" onClick={() => setD((o) => {
                  const have = new Set(o.by_type.map((r) => r.type));
                  const extra = Object.keys(suggestPiles).filter((t) => !have.has(t)).map((type) => ({ type, m3: null, piles: null }));
                  return { ...o, by_type: [...o.by_type, ...extra].map((r) => (r.type in suggestPiles ? { ...r, piles: suggestPiles[r.type] } : r)) };
                })}><Icon name="dl" size={15} />เติมจำนวนต้นจากแผนตอก</button>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="pm-in">
                <thead><tr><th>ผลิตภัณฑ์</th><th>ลบ.ม.</th><th>จำนวนต้น</th><th>โครงการ</th><th /></tr></thead>
                <tbody>
                  {d.products.map((r, i) => (
                    <tr key={i}>
                      <td><input className="input" value={r.product} onChange={(e) => updP(i, { product: e.target.value })} style={{ width: 90 }} placeholder="IP40A" /></td>
                      <td><NumIn value={r.m3} onChange={(v) => updP(i, { m3: v })} w={90} /></td>
                      <td><NumIn value={r.piles} onChange={(v) => updP(i, { piles: v })} w={90} /></td>
                      <td><input className="input" value={r.projects} onChange={(e) => updP(i, { projects: e.target.value })} style={{ width: 260 }} placeholder="บ.คริสเตียนี, บ.ไซโคฯ" /></td>
                      <td><button className="icon-btn sm" type="button" title="ลบ" onClick={() => setD((o) => ({ ...o, products: o.products.filter((_, k) => k !== i) }))}><Icon name="trash" size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pm-row-btns">
                <button className="btn ghost sm" type="button" onClick={() => setD((o) => ({ ...o, products: [...o.products, { product: "", m3: null, piles: null, projects: "" }] }))}><Icon name="plus" size={15} />เพิ่มผลิตภัณฑ์</button>
              </div>
            </div>
          </div>
          <Foot pending={pending} msg={msg} onCancel={close} onSave={() => save(d)} />
        </>
      )}
    </Panel>
  );
}
