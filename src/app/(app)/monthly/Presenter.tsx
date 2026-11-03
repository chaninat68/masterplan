"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

export type Slide = { key: string; title: string; node: ReactNode; edit?: ReactNode; presentOnly?: boolean };

/**
 * หน้าเว็บปกติ = สไลด์เรียงต่อกัน + ฟอร์มแก้ไขใต้แต่ละสไลด์
 * โหมดนำเสนอ = เต็มจอ ทีละสไลด์ (← → / PageUp PageDown / Space, Esc ออก) ซ่อนฟอร์มแก้ไขทั้งหมด
 */
export function Presenter({ slides, toolbar, docTitle }: { slides: Slide[]; toolbar?: ReactNode; docTitle: string }) {
  const [idx, setIdx] = useState<number | null>(null);
  // พิมพ์ / PDF: วาดทุกสไลด์ไว้ใน .print-root (1 สไลด์ = 1 หน้า A4 แนวนอน)
  // "pdf" = แปลงแต่ละสไลด์เป็นรูปแล้วรวมเป็นไฟล์ PDF ดาวน์โหลดทันที · "print" = เปิดหน้าต่างพิมพ์ของเบราว์เซอร์
  const [mode, setMode] = useState<null | "pdf" | "print">(null);
  const [progress, setProgress] = useState("");
  const printRoot = useRef<HTMLDivElement>(null);
  const printing = mode != null;

  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    const old = document.title;
    (async () => {
      const root = printRoot.current;
      const imgs = Array.from(root?.querySelectorAll("img") ?? []);
      await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))));
      await document.fonts?.ready;
      if (cancelled || !root) return;
      if (mode === "print") {
        document.title = docTitle;
        window.addEventListener("afterprint", () => { document.title = old; setMode(null); }, { once: true });
        window.print();
        return;
      }
      try {
        const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
        const pages = Array.from(root.querySelectorAll<HTMLElement>(".print-page"));
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
        const W = 297, H = 210, M = 8;
        for (let i = 0; i < pages.length; i++) {
          if (cancelled) return;
          setProgress(`${i + 1}/${pages.length}`);
          const el = pages[i];
          const url = await toJpeg(el, { quality: 0.9, pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: false, includeQueryParams: true });
          const w = el.offsetWidth, h = el.offsetHeight;
          const s = Math.min((W - 2 * M) / w, (H - 2 * M) / h);
          if (i > 0) pdf.addPage();
          pdf.addImage(url, "JPEG", (W - w * s) / 2, M, w * s, h * s, undefined, "FAST");
        }
        pdf.save(`${docTitle}.pdf`);
      } catch (e) {
        alert("สร้าง PDF ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        if (!cancelled) { setMode(null); setProgress(""); }
      }
    })();
    return () => { cancelled = true; };
  }, [mode, docTitle]);
  const box = useRef<HTMLDivElement>(null);
  const n = slides.length;
  const go = useCallback((d: number) => setIdx((i) => (i == null ? i : Math.min(n - 1, Math.max(0, i + d)))), [n]);
  const close = useCallback(() => {
    setIdx(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    if (idx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(1); }
      else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setIdx(0);
      else if (e.key === "End") setIdx(n - 1);
      else if (e.key === "Escape") close();
    };
    const onFs = () => { if (!document.fullscreenElement) setIdx(null); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); };
  }, [idx, go, close, n]);

  useEffect(() => { box.current?.querySelector(".present-body")?.scrollTo(0, 0); }, [idx]);

  const start = (i = 0) => {
    setIdx(i);
    requestAnimationFrame(() => box.current?.requestFullscreen?.().catch(() => {}));
  };

  return (
    <>
      <div className="pm-toolbar">
        <button className="btn" type="button" onClick={() => start(0)}><span aria-hidden>▶</span>เริ่มนำเสนอ</button>
        <button className="btn ghost" type="button" disabled={printing} onClick={() => setMode("pdf")} title="บันทึกทุกสไลด์เป็นไฟล์ PDF (A4 แนวนอน)">
          <Icon name="dl" size={16} />{mode === "pdf" ? `กำลังสร้าง PDF… ${progress}` : "ดาวน์โหลด PDF"}
        </button>
        <button className="btn ghost" type="button" disabled={printing} onClick={() => setMode("print")} title="พิมพ์ลงกระดาษ">
          <Icon name="doc" size={16} />พิมพ์
        </button>
        <span className="pm-tip">เต็มจอ · ← → เลื่อนสไลด์ · Esc ออก</span>
        <span style={{ flex: 1 }} />
        {toolbar}
      </div>
      <div className="pm-deck">
        {slides.map((s, i) => s.presentOnly ? null : (
          <section className="card pm-card" key={s.key} id={`s-${s.key}`}>
            <div className="pm-card-head">
              <span className="pm-no">{i + 1}</span>
              <span className="pm-card-title">{s.title}</span>
              <button className="btn ghost sm" type="button" onClick={() => start(i)} title="นำเสนอจากสไลด์นี้">▶ นำเสนอจากหน้านี้</button>
            </div>
            <div className="pslide">{s.node}</div>
            {s.edit}
          </section>
        ))}
      </div>
      {printing && createPortal(
        <div className={`print-root ${mode === "pdf" ? "export" : ""}`} ref={printRoot}>
          {slides.map((s) => <section className="print-page" key={s.key}><div className="pslide print">{s.node}</div></section>)}
        </div>,
        document.body,
      )}
      <div ref={box} className={`present ${idx == null ? "off" : ""}`} aria-hidden={idx == null}>
        {idx != null && (
          <>
            <div className="present-body"><div className="pslide big">{slides[idx].node}</div></div>
            <div className="present-nav">
              <button className="icon-btn" type="button" onClick={() => go(-1)} disabled={idx === 0} aria-label="ก่อนหน้า">‹</button>
              <span className="present-count">{idx + 1} / {n} · {slides[idx].title}</span>
              <button className="icon-btn" type="button" onClick={() => go(1)} disabled={idx === n - 1} aria-label="ถัดไป">›</button>
              <button className="icon-btn" type="button" onClick={close} aria-label="ออกจากโหมดนำเสนอ">✕</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** เลือกครั้งประชุม → ?m=YYYY-MM-DD */
export function MonthlyPicker({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <span className="chip">
      <Icon name="cal" size={16} />
      ประชุมวันที่
      <select className="chip-select" value={value} aria-label="เลือกครั้งประชุม"
        onChange={(e) => { const q = new URLSearchParams(sp.toString()); q.set("m", e.target.value); router.push(`${path}?${q}`, { scroll: false }); }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}
