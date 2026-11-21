"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { STATUS_LABEL } from "@/lib/format";
import { addProject, deleteProject, updateProject } from "./actions";

const STATUSES = ["ongoing", "on_hand", "hold", "completed", "cancelled"] as const;

/** เปลี่ยนสถานะจากหน้ารายการ (admin/planning) */
export function StatusSelect({ code, status }: { code: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      className={`badge st-${status} status-sel`}
      value={status}
      disabled={pending}
      aria-label={`สถานะ ${code}`}
      onChange={(e) => {
        const v = e.target.value;
        start(async () => {
          const r = await updateProject(code, "status", v);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}
    >
      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  );
}

/** ลบโครงการ — ฐานข้อมูลอนุญาตเฉพาะโครงการที่ยังไม่มีผลงานตอก */
export function DeleteProject({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="icon-btn"
      title={`ลบโครงการ ${code}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`ลบโครงการ ${code} ${name} ?\nแผนงานและหมายเหตุของโครงการนี้จะถูกลบด้วย และจะไม่ถูกสร้างกลับจากไฟล์ SO`)) return;
        start(async () => {
          const r = await deleteProject(code);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}
    >
      <Icon name="trash" />
    </button>
  );
}

const EMPTY = { code: "", project_name: "", customer_name: "", sales: "", pm: "", status: "on_hand" as "ongoing" | "on_hand" | "hold", order_qty: "" };

/** ปุ่ม + ฟอร์มเพิ่มโครงการ → ไปหน้าโครงการเพื่อวางแผนต่อ */
export function AddProject() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const close = () => { setOpen(false); setF(EMPTY); setErr(""); };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await addProject({ ...f, order_qty: f.order_qty || "0" });
      if (!r.ok) return setErr(r.error);
      const code = f.code.trim().toUpperCase();
      close();
      router.push(`/projects/${code}`);
    });
  }

  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}><Icon name="plus" />เพิ่มโครงการ</button>
      <div className={`modal-bg ${open ? "show" : ""}`} onClick={(e) => e.target === e.currentTarget && !pending && close()}>
        <form className="modal add-proj" onSubmit={submit}>
          <h3 style={{ margin: "0 0 4px" }}>เพิ่มโครงการ</h3>
          <p className="sub" style={{ marginTop: 0 }}>บันทึกแล้วไปหน้าโครงการเพื่อใส่แผนงาน · ถ้ารหัสนี้มีใบ SO ชื่อลูกค้า/โครงการ/ยอดสั่งซื้อจะปรับตาม SO เมื่อนำเข้าไฟล์ SO ครั้งถัดไป</p>
          <div className="add-grid">
            <label>รหัสโครงการ *<input className="input" required value={f.code} onChange={set("code")} placeholder="A69-A999" pattern="[A-Za-z]\d{2}-[A-Za-z]\d{3,4}" /></label>
            <label>สถานะ<select className="input" value={f.status} onChange={set("status")}>
              {(["on_hand", "ongoing", "hold"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select></label>
            <label className="wide">ชื่อโครงการ *<input className="input" required value={f.project_name} onChange={set("project_name")} /></label>
            <label className="wide">ลูกค้า<input className="input" value={f.customer_name} onChange={set("customer_name")} /></label>
            <label>เซลล์<input className="input" value={f.sales} onChange={set("sales")} /></label>
            <label>PM<input className="input" value={f.pm} onChange={set("pm")} /></label>
            <label>ยอดสั่งซื้อ (ต้น)<input className="input" type="number" min={0} step="any" value={f.order_qty} onChange={set("order_qty")} /></label>
          </div>
          {err && <div className="banner bad" style={{ marginTop: 12 }}>✖ {err}</div>}
          <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
            <div className="grow" />
            <button type="button" className="btn ghost sm" disabled={pending} onClick={close}>ยกเลิก</button>
            <button type="submit" className="btn sm" disabled={pending}><Icon name="check" />{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
