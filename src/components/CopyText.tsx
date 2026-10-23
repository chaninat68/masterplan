"use client";

import { useState } from "react";
import { Icon } from "./Icon";

/** ปุ่มเปิดกล่องข้อความ + คัดลอก (ใช้กับสรุปส่ง LINE / คัดลอกไป Excel) */
export function CopyTextButton({ title, text, icon = "copy", sm }: { title: string; text: string; icon?: string; sm?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <button type="button" className={`btn ghost ${sm ? "sm" : ""}`} onClick={() => setOpen(true)}>
        <Icon name={icon} />
        {title}
      </button>
      {open && (
        <div className="modal-bg show" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal">
            <div className="card-h">
              <h3>{title}</h3>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="ปิด">✕</button>
            </div>
            <textarea readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={copy}>{copied ? "คัดลอกแล้ว ✔" : "คัดลอก"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
