"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: true } | { ok: false; error: string };

/** คลิกเพื่อแก้ไข — Enter/คลิกนอกช่อง = บันทึก, Esc = ยกเลิก */
export function InlineEdit(props: {
  value: string;
  display?: ReactNode;
  onSave: (v: string) => Promise<Result>;
  canEdit: boolean;
  type?: "text" | "number" | "date" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  quick?: string[];
  width?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(props.value);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!props.canEdit) return <>{props.display ?? (props.value || "–")}</>;

  function save(val: string) {
    setEditing(false);
    if (val === props.value) return;
    start(async () => {
      const r = await props.onSave(val);
      if (!r.ok) { setErr(r.error); setV(props.value); }
      else { setErr(""); router.refresh(); }
    });
  }

  if (!editing)
    return (
      <span className={`ed ${pending ? "saving" : ""}`} role="button" tabIndex={0} title="คลิกเพื่อแก้ไข"
        onClick={() => { setV(props.value); setEditing(true); }} onKeyDown={(e) => e.key === "Enter" && setEditing(true)}>
        {props.display ?? (props.value || <span className="note-add">{props.placeholder ?? "+ เพิ่ม"}</span>)}
        {err && <span className="form-err" style={{ display: "block" }}>{err}</span>}
      </span>
    );

  const common = {
    autoFocus: true,
    value: v,
    onBlur: () => setTimeout(() => save(v), 120),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") save(v);
      if (e.key === "Escape") { setEditing(false); setV(props.value); }
    },
  };
  return (
    <span className="ed">
      {props.type === "select" ? (
        <select {...common} onChange={(e) => { setV(e.target.value); save(e.target.value); }}>
          {props.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input {...common} type={props.type ?? "text"} step="any" placeholder={props.placeholder}
          style={props.width ? { width: props.width } : undefined} onChange={(e) => setV(e.target.value)} />
      )}
      {props.quick && (
        <span className="quick">
          {props.quick.map((q) => (
            <button key={q} type="button" onMouseDown={(e) => { e.preventDefault(); setV(q); save(q); }}>{q}</button>
          ))}
        </span>
      )}
    </span>
  );
}
