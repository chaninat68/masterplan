"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { commitImport, previewImport, type Kind, type Preview } from "./actions";

const KINDS: { kind: Kind; title: string; desc: string }[] = [
  { kind: "queue", title: "รายงานคิว-วัน (ทุกวัน)", desc: "ไฟล์สะสมทั้งปีจากทีมตอก — เพิ่มเฉพาะแถวใหม่ แถวที่มีแล้วข้ามให้อัตโนมัติ" },
  { kind: "master_planning", title: "Master Planning", desc: "แท็บ Pile — ข้อมูลโครงการ + แผนรายวัน (ใช้ตอนเริ่มระบบ หรือเมื่ออัพเดทแผนใน Excel)" },
  { kind: "sales", title: "ข้อมูล SO และใบเปลี่ยนแปลง", desc: "แท็บ dataรวม — เอกสารขาย P / R / C และลูกค้า" },
];

export function ImportPanel() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("queue");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const fd = (f: File) => {
    const d = new FormData();
    d.set("file", f);
    return d;
  };
  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setResult(null);
    setPreview(null);
    start(async () => setPreview(await previewImport(kind, fd(f))));
  }
  function confirm() {
    if (!file) return;
    start(async () => {
      const r = await commitImport(kind, fd(file));
      setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) {
        setPreview(null);
        setFile(null);
        router.refresh();
      }
    });
  }
  const cols = preview?.ok && preview.sample[0] ? Object.keys(preview.sample[0]) : [];

  return (
    <div className="card">
      <div className="seg" style={{ marginBottom: 14 }}>
        {KINDS.map((k) => (
          <button key={k.kind} type="button" className={kind === k.kind ? "on" : ""} onClick={() => { setKind(k.kind); setPreview(null); setFile(null); setResult(null); }}>
            {k.title}
          </button>
        ))}
      </div>
      <p className="sub" style={{ marginTop: 0 }}>{KINDS.find((k) => k.kind === kind)!.desc}</p>
      <label
        className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      >
        <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <Icon name="up" />
        <b>{file ? file.name : "ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก"}</b>
        <span className="muted">{pending ? "กำลังอ่านไฟล์…" : "ไฟล์ Excel (.xlsx) สูงสุด 40MB"}</span>
      </label>

      {result && <div className={`banner ${result.ok ? "ok" : "bad"}`} style={{ marginTop: 14 }}>{result.ok ? "✔ " : "✖ "}{result.text}</div>}
      {preview && !preview.ok && <div className="banner bad" style={{ marginTop: 14 }}>✖ {preview.error}</div>}
      {preview?.ok && (
        <>
          <div className="sumrow">
            {preview.stats.map((s) => (
              <div key={s.label}>
                <span className={s.tone ? `tag-${s.tone}` : "muted"}>{s.label}</span>
                <b>{s.value.toLocaleString("th-TH")}</b>
              </div>
            ))}
          </div>
          {preview.note && <div className="sub" style={{ marginBottom: 10 }}>{preview.note}</div>}
          <div className="toolbar">
            <b>{preview.fileName}</b>
            <div className="grow" />
            <button className="btn ghost sm" type="button" onClick={() => { setPreview(null); setFile(null); }}>ยกเลิก</button>
            <button className="btn sm" type="button" disabled={pending} onClick={confirm}>
              <Icon name="check" />
              {pending ? "กำลังบันทึก…" : "ยืนยันนำเข้า"}
            </button>
          </div>
          {preview.errors.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary className="tag-err" style={{ cursor: "pointer" }}>แถวที่มีปัญหา {preview.errors.length} รายการ</summary>
              <ul className="sub">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </details>
          )}
          {cols.length > 0 ? (
            <div className="tbl-wrap" style={{ maxHeight: 380, overflow: "auto" }}>
              <table>
                <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr key={i}>{cols.map((c) => <td key={c} className={typeof r[c] === "number" ? "num" : ""}>{typeof r[c] === "number" ? Number(r[c]).toLocaleString("th-TH") : r[c]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">ไม่มีแถวใหม่ — ข้อมูลในไฟล์มีอยู่ในระบบครบแล้ว</div>
          )}
        </>
      )}
    </div>
  );
}
