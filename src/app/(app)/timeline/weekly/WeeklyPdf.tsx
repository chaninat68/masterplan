"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

// ขนาดหน้า A3 แนวนอนหักขอบ 8 มม. (404 × 281 มม.) ที่ 96 dpi
const PAGE_W = 1527, PAGE_H = 1062;

/** ย่อเนื้อหาแต่ละหน้าให้พอดี 1 แผ่น A3 (ถ้าโครงการเยอะ) — ใช้ทั้งพรีวิวบนจอและตอนสร้าง PDF */
function fitPages() {
  for (const page of document.querySelectorAll<HTMLElement>(".wk-page")) {
    const inner = page.querySelector<HTMLElement>(".wk-in");
    if (!inner) continue;
    inner.style.transform = "";
    inner.style.width = `${PAGE_W}px`;
    const h = inner.scrollHeight;
    if (h > PAGE_H) {
      const s = PAGE_H / h;
      inner.style.width = `${PAGE_W / s}px`;
      const h2 = inner.scrollHeight; // ความกว้างเพิ่ม → ชื่อยาวขึ้นบรรทัดน้อยลง วัดใหม่
      const s2 = Math.min(1, PAGE_H / h2);
      inner.style.width = `${PAGE_W / s2}px`;
      inner.style.transform = `scale(${s2})`;
    }
  }
}

/** ดาวน์โหลด PDF: แปลงแต่ละหน้าเป็นรูป (html-to-image) แล้วรวมเป็น A3 แนวนอนด้วย jsPDF */
export function WeeklyPdf({ fileName }: { fileName: string }) {
  const [busy, setBusy] = useState("");
  useEffect(() => {
    fitPages();
    document.fonts?.ready.then(fitPages);
  }, []);

  async function download() {
    setBusy("กำลังเตรียม…");
    try {
      await document.fonts?.ready;
      fitPages();
      const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".wk-page"));
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
      for (let i = 0; i < pages.length; i++) {
        setBusy(`กำลังสร้าง ${i + 1}/${pages.length}`);
        const url = await toJpeg(pages[i], { quality: 0.92, pixelRatio: 2.2, backgroundColor: "#ffffff", cacheBust: false, width: PAGE_W, height: PAGE_H });
        if (i > 0) pdf.addPage();
        pdf.addImage(url, "JPEG", 8, 8, 404, 281, undefined, "FAST");
      }
      pdf.save(`${fileName}.pdf`);
    } catch (e) {
      alert("สร้าง PDF ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  return (
    <button type="button" className="btn sm" onClick={download} disabled={!!busy}>
      <Icon name="dl" />{busy || "ดาวน์โหลด PDF"}
    </button>
  );
}
