"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import { Icon } from "./Icon";
import { fDate } from "@/lib/format";

/** ชิป "ข้อมูลถึง" ที่คลิกเลือกวันที่ได้ → ?asof=YYYY-MM-DD (ไม่เกินวันที่ข้อมูลล่าสุด) */
export function AsofPicker({ value, latest, min = "2026-01-01" }: { value: string; latest: string; min?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const go = (d: string) => {
    const q = new URLSearchParams(sp.toString());
    if (!d || d >= latest) q.delete("asof");
    else q.set("asof", d);
    const qs = q.toString();
    start(() => router.push(qs ? `${path}?${qs}` : path, { scroll: false }));
  };
  const past = value < latest;
  return (
    <span className={`chip asof-pick${past ? " past" : ""}`} style={{ opacity: pending ? 0.6 : 1 }}>
      <label title="เลือกวันที่เพื่อดูข้อมูลย้อนหลัง">
        <Icon name="cal" size={16} />
        ข้อมูลถึง {fDate(value)}
        <input ref={ref} type="date" value={value} min={min} max={latest} onChange={(e) => go(e.target.value)}
          onClick={() => ref.current?.showPicker?.()} aria-label="ข้อมูลถึงวันที่" />
      </label>
      {past && (
        <button type="button" onClick={() => go("")} title={`กลับไปข้อมูลล่าสุด ${fDate(latest)}`}>
          ล่าสุด
        </button>
      )}
    </span>
  );
}
