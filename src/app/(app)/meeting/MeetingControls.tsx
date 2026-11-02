"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { addPipeline, deletePipeline } from "./actions";

/** เลือกครั้งประชุม → ?m=YYYY-MM-DD */
export function MeetingPicker({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <span className="chip" style={{ opacity: pending ? 0.6 : 1 }}>
      <Icon name="cal" size={16} />
      ประชุมวันที่
      <select className="chip-select" value={value} aria-label="เลือกครั้งประชุม"
        onChange={(e) => {
          const q = new URLSearchParams(sp.toString());
          q.set("m", e.target.value);
          start(() => router.push(`${path}?${q}`, { scroll: false }));
        }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}

/** เพิ่มรายการงานที่คาดว่าจะได้ (มูลค่ากรอกเป็นล้านบาท) */
export function AddItem({ meetingId, people, months }: { meetingId: string; people: string[]; months: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return <button className="btn ghost sm" type="button" onClick={() => setOpen(true)}><Icon name="plus" />เพิ่มรายการ</button>;
  return (
    <form className="add-item" onSubmit={(e) => {
      e.preventDefault();
      const input = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      start(async () => {
        const r = await addPipeline({ ...input, meeting_id: meetingId });
        if (r.ok) { setOpen(false); setErr(""); router.refresh(); } else setErr(r.error);
      });
    }}>
      <select className="input" name="salesperson" required defaultValue="">
        <option value="" disabled>เซลล์</option>
        {people.map((p) => <option key={p}>{p}</option>)}
      </select>
      <select className="input" name="product" defaultValue="IP"><option>IP</option><option>HC</option><option>PC</option></select>
      <input className="input" name="customer" placeholder="ลูกค้า" />
      <input className="input" name="project" placeholder="โครงการ" required />
      <input className="input" name="value" type="number" step="0.01" min="0" placeholder="มูลค่า (ล้าน)" required style={{ width: 120 }} />
      <select className="input" name="category" defaultValue="best">
        <option value="base">Base</option><option value="best">Best</option><option value="excluded">ไม่บวกเข้ายอด</option>
      </select>
      <select className="input" name="expected_month" defaultValue={months[1]?.value ?? ""}>
        <option value="">ไม่ระบุเดือน</option>
        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <input className="input" name="status_note" placeholder="สถานะปัจจุบัน" />
      <button className="btn sm" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
      <button className="btn ghost sm" type="button" onClick={() => { setOpen(false); setErr(""); }}>ยกเลิก</button>
      {err && <span className="err">{err}</span>}
    </form>
  );
}

export function DeleteItem({ id, label }: { id: number; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="icon-btn sm" type="button" title="ลบรายการ" disabled={pending}
      onClick={() => {
        if (!confirm(`ลบรายการ "${label}" ?`)) return;
        start(async () => {
          const r = await deletePipeline(id);
          if (r.ok) router.refresh(); else alert(r.error);
        });
      }}>
      <Icon name="trash" size={15} />
    </button>
  );
}
