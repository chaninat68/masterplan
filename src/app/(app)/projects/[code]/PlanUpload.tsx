"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fDate, fNum } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { undoImport } from "../../import/actions";
import { importPlanFile, previewPlanFile, type PlanPreview } from "./planActions";

/** อัปโหลดไฟล์แผนงาน (Excel) ของโครงการนี้ → แทนที่แผนตั้งแต่วันแรกในไฟล์ */
export function PlanUpload({ code }: { code: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pv, setPv] = useState<PlanPreview | null>(null);
  const [done, setDone] = useState<{ batchId: string; message: string } | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const fd = (f: File) => { const d = new FormData(); d.set("file", f); return d; };
  const close = () => { setFile(null); setPv(null); setErr(""); if (input.current) input.current.value = ""; };
  const pick = (f?: File) => {
    if (!f) return;
    setFile(f); setPv(null); setErr(""); setDone(null);
    start(async () => {
      const r = await previewPlanFile(code, fd(f));
      if (r.ok) setPv(r); else setErr(r.error);
    });
  };
  const commit = () => file && start(async () => {
    const r = await importPlanFile(code, fd(file));
    if (!r.ok) { setErr(r.error); return; }
    setDone(r); close(); router.refresh();
  });
  const undo = () => done && start(async () => {
    if (!confirm("ย้อนกลับแผนเป็นแบบก่อนอัปโหลดไฟล์?")) return;
    const r = await undoImport(done.batchId);
    if (!r.ok) alert(r.error);
    setDone(null); router.refresh();
  });

  const p = pv?.ok ? pv : null;
  const newTotal = p ? p.keepBefore + p.fileTotal : 0;

  return (
    <>
      <button type="button" className="btn ghost sm" disabled={pending} onClick={() => input.current?.click()}>
        <Icon name="up" /> อัปโหลดไฟล์แผนงาน
      </button>
      <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {done && (
        <span className="plan-done">✔ {done.message} <button type="button" className="btn ghost sm" disabled={pending} onClick={undo}>ย้อนกลับ</button></span>
      )}

      <div className={`modal-bg ${file ? "show" : ""}`} onClick={(e) => e.target === e.currentTarget && !pending && close()}>
        <div className="modal plan-modal">
          <h3 style={{ margin: "0 0 4px" }}>อัปเดตแผนงาน {code}</h3>
          <div className="sub">{file?.name}</div>
          {pending && !p && <div className="muted" style={{ padding: "18px 0" }}>กำลังอ่านไฟล์…</div>}
          {err && <div className="banner bad" style={{ margin: "12px 0" }}>{err}</div>}
          {p && (
            <>
              <div className="minis m3" style={{ margin: "14px 0" }}>
                <div><b>{fNum(p.fileTotal)}</b>ต้น ตามไฟล์ ({p.days.length} วัน)</div>
                <div><b>{fDate(p.from)}</b>ถึง {fDate(p.to)}</div>
                <div><b>{fNum(newTotal)}</b>แผนรวมหลังอัปเดต · สั่งซื้อ {fNum(p.orderQty)}</div>
              </div>
              <ul className="plan-notes">
                <li>แผนตั้งแต่ <b>{fDate(p.from)}</b> เป็นต้นไป (เดิม {fNum(p.replaced)} ต้น) จะถูกแทนที่ด้วยแผนในไฟล์</li>
                {p.keepBefore > 0 && <li>แผนก่อน {fDate(p.from)} คงไว้ {fNum(p.keepBefore)} ต้น</li>}
                {Math.abs(newTotal - p.orderQty) >= 0.5 && <li className="warn">แผนรวม {fNum(newTotal)} ต้น {newTotal > p.orderQty ? "มากกว่า" : "น้อยกว่า"}ยอดสั่งซื้อ {fNum(Math.abs(newTotal - p.orderQty))} ต้น</li>}
                {p.rows.length > 1 && <li>รวมจาก {p.rows.length} แถว: {p.rows.join(", ")}</li>}
                {p.warnings.map((w) => <li key={w} className="muted">{w}</li>)}
              </ul>
              <div className="plan-days">
                {p.days.map((d) => <span key={d.date}><i>{fDate(d.date).replace(/ \d+$/, "")}</i>{fNum(d.qty)}</span>)}
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="btn ghost" disabled={pending} onClick={close}>ยกเลิก</button>
            <button type="button" className="btn" disabled={pending || !p} onClick={commit}>{pending && p ? "กำลังบันทึก…" : "ยืนยันอัปเดตแผน"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
