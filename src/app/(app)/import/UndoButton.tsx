"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoImport } from "./actions";

export function UndoButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn ghost sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("ย้อนกลับการนำเข้านี้? แถวที่เพิ่มจากไฟล์นี้จะถูกลบ")) return;
        start(async () => {
          const r = await undoImport(id);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}
    >
      {pending ? "กำลังย้อนกลับ…" : "ย้อนกลับ"}
    </button>
  );
}
