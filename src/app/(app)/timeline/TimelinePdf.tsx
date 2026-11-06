"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

/*
 * ดาวน์โหลด PDF ของตาราง Project Timeline ที่แสดงอยู่ (รวมผลค้นหา)
 * อ่านข้อมูลจากตารางในหน้า → วาดลง canvas เอง (เร็วกว่าแปลง DOM เป็นรูปหลายสิบเท่า) → รวมเป็น PDF A3 แนวนอน
 * 1 หน้า = 2 เดือน × โครงการเท่าที่พอดีหน้า · โทนสว่างเสมอ
 * แต่ละช่วงเดือนแสดงเฉพาะโครงการที่มีแผน/ผลงานในช่วงนั้น (ไม่มีเลย = ข้ามช่วงนั้น)
 * โครงการที่ยังไม่มีแผนเลยแสดงในช่วงที่มีวันนี้
 */
const MONTHS_PER_PAGE = 2;
const STICKY = 5;
const S = 1.75; // ความละเอียด (เท่าของ px)
const P = 24; // ขอบกระดาษ
const COLS = [240, 58, 68, 60, 46]; // โครงการ, สั่งซื้อ, คงเหลือ, Ahead/Behind, Plan/Actual
const LEFT = COLS.reduce((a, b) => a + b, 0);
const DW = 26; // กว้างช่องวัน
const MAX_DAYS = 62;
const PAGE_W = P * 2 + LEFT + DW * MAX_DAYS;
const PAGE_H = Math.round(PAGE_W * (297 / 420));
const HEAD_H = 74; // หัวกระดาษ + ชิปสรุป
const MON_H = 22, DAY_H = 30; // แถวหัวเดือน / หัววัน
const RH_MIN = 19, RH_MAX = 26; // สูงแถว Plan หรือ Actual (ขยายให้เต็มหน้าถ้าโครงการน้อย)
const BODY_H = PAGE_H - P * 2 - HEAD_H - MON_H - DAY_H;

const C = {
  ink: "#0b1a3a", ink2: "#4a5878", muted: "#8793ab", line: "#e5ebf5", line2: "#d3dcea", head: "#f6f9fe",
  accent: "#1d6bf3", bad: "#d03b3b", badInk: "#c02f2f", goodInk: "#0a7a0a", goodSoft: "#e5f6e5",
  warn: "#fab219", warnInk: "#9a6a00", warnSoft: "#fff4dc", sun: "#fcf3f3",
};
const GROUP = {
  on: { chip: "#1565c0", chipInk: "#ffffff", plan: "#ccdef1" },
  oh: { chip: "#b3e5fc", chipInk: "#0b3a5c", plan: "#c7ecfc" },
  hd: { chip: "#c62828", chipInk: "#ffffff", plan: "#f4d4d4" },
} as const;
type G = keyof typeof GROUP;

type Cell = { t: string; c: DOMTokenList };
type Day = { n: string; w: string; sun: boolean; today: boolean; note: boolean };
type Proj = {
  code: string; g: G; name: string; sub: string; meta: string; order: string; remain: string; remainSub: string;
  ab: string; abUp: boolean; none: string | null; plan: Cell[]; act: Cell[];
};

export function TimelinePdf({ fileName }: { fileName: string }) {
  const [progress, setProgress] = useState<string | null>(null);

  const run = async () => {
    const table = document.querySelector<HTMLTableElement>("#tl-wrap table.tl");
    if (!table || progress) return;
    setProgress("…");
    try {
      const { jsPDF } = await import("jspdf");
      await document.fonts?.ready;
      const font = getComputedStyle(document.body).fontFamily;
      const data = read(table);

      // แบ่งหน้า: ช่วงเดือน × ช่วงโครงการ (แบ่งเท่าๆ กัน)
      const cols: { label: string; a: number; b: number }[] = [];
      for (let i = 0; i < data.months.length; i += MONTHS_PER_PAGE) {
        const g = data.months.slice(i, i + MONTHS_PER_PAGE);
        cols.push({ label: g.map((m) => m.label).join(" – "), a: g[0].a, b: g[g.length - 1].b });
      }
      const fit = Math.floor(BODY_H / (RH_MIN * 2));
      const todayIdx = data.days.findIndex((x) => x.today);
      const pages: { c: (typeof cols)[number]; rows: Proj[]; from: number; to: number; all: number }[] = [];
      for (const c of cols) {
        const hasToday = todayIdx >= c.a && todayIdx < c.b;
        const inRange = data.projects.filter((p) =>
          p.none != null ? hasToday : p.plan.slice(c.a, c.b).some((x) => x.t) || p.act.slice(c.a, c.b).some((x) => x.t));
        if (!inRange.length) continue;
        const nRowPages = Math.ceil(inRange.length / fit);
        const per = Math.ceil(inRange.length / nRowPages);
        for (let r = 0; r < nRowPages; r++) {
          const rows = inRange.slice(r * per, (r + 1) * per);
          pages.push({ c, rows, from: r * per + 1, to: r * per + rows.length, all: inRange.length });
        }
      }
      const total = pages.length;

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
      const canvas = document.createElement("canvas");
      canvas.width = PAGE_W * S;
      canvas.height = PAGE_H * S;
      const ctx = canvas.getContext("2d")!;
      let n = 0;
      for (const pg of pages) {
        n++;
        setProgress(`${n}/${total}`);
        await new Promise((res) => setTimeout(res, 0)); // ให้ปุ่มอัปเดตตัวเลข
        drawPage(ctx, font, data, pg.c, pg.rows, { n, total, from: pg.from, to: pg.to, all: pg.all });
        if (n > 1) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, 420, 297, undefined, "FAST");
      }
      pdf.save(`${fileName}.pdf`);
    } catch (e) {
      alert("สร้าง PDF ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProgress(null);
    }
  };

  return (
    <button type="button" className="btn tl-pdf" onClick={run} disabled={!!progress}>
      <Icon name="dl" />{progress ? `กำลังสร้าง PDF ${progress}` : "ดาวน์โหลด PDF"}
    </button>
  );
}

/** อ่านข้อมูลจากตารางที่แสดงอยู่ */
function read(table: HTMLTableElement) {
  const [h1, h2] = Array.from(table.tHead!.rows);
  const months: { label: string; a: number; b: number }[] = [];
  let at = 0;
  for (const th of Array.from(h1.cells).slice(STICKY)) {
    months.push({ label: th.textContent ?? "", a: at, b: at + th.colSpan });
    at += th.colSpan;
  }
  const days: Day[] = Array.from(h2.cells).slice(STICKY).map((th) => ({
    n: th.firstChild?.textContent ?? "",
    w: th.querySelector("small")?.textContent ?? "",
    sun: th.classList.contains("sun"),
    today: th.classList.contains("today"),
    note: !!th.querySelector(".ni"),
  }));
  const trs = Array.from(table.tBodies[0].rows);
  const projects: Proj[] = [];
  for (let i = 0; i + 1 < trs.length; i += 2) {
    const pc = Array.from(trs[i].cells), ac = Array.from(trs[i + 1].cells);
    const code = pc[0].querySelector(".tl-code");
    const nameEl = pc[0].querySelector(".tl-name");
    const dayCells = pc.slice(STICKY);
    const none = dayCells.length === 1 && dayCells[0].colSpan > 1 ? dayCells[0].textContent ?? "" : null;
    projects.push({
      code: code?.textContent ?? "",
      g: ((["on", "oh", "hd"] as const).find((k) => code?.classList.contains(k)) ?? "on"),
      name: nameEl?.firstChild?.textContent ?? "",
      sub: nameEl?.querySelector("small")?.textContent ?? "",
      meta: pc[0].querySelector(".tl-meta")?.textContent ?? "",
      order: pc[1].textContent ?? "",
      remain: pc[2].querySelector("b")?.textContent ?? "",
      remainSub: pc[2].querySelector("small")?.textContent ?? "",
      ab: pc[3].textContent ?? "",
      abUp: pc[3].classList.contains("up"),
      none,
      plan: none == null ? dayCells.map((td) => ({ t: td.textContent ?? "", c: td.classList })) : [],
      act: none == null ? ac.slice(1).map((td) => ({ t: td.textContent ?? "", c: td.classList })) : [],
    });
  }
  const chips = Array.from(document.querySelectorAll<HTMLElement>(".tl-sum .tl-chip")).map((el) => ({
    g: ((["on", "oh", "hd"] as const).find((k) => el.classList.contains(k)) ?? "on"),
    t: el.innerText.replace(/\s+/g, " ").trim(),
  }));
  const range = document.querySelector<HTMLElement>(".tl-sum > .chip")?.innerText ?? "";
  return { months, days, projects, chips, range };
}

function drawPage(
  ctx: CanvasRenderingContext2D, font: string, d: ReturnType<typeof read>,
  col: { label: string; a: number; b: number }, rows: Proj[],
  pg: { n: number; total: number; from: number; to: number; all: number },
) {
  const f = (size: number, weight = 400, italic = false) => { ctx.font = `${italic ? "italic " : ""}${weight} ${size}px ${font}`; };
  const text = (t: string, x: number, y: number, max?: number, align: CanvasTextAlign = "left") => {
    ctx.textAlign = align;
    ctx.fillText(max ? clip(ctx, t, max) : t, x, y);
  };
  const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const hline = (x1: number, x2: number, y: number, color: string, w = 1) => rect(x1, y - w / 2, x2 - x1, w, color);
  const vline = (x: number, y1: number, y2: number, color: string, w = 1) => rect(x - w / 2, y1, w, y2 - y1, color);

  const RH = Math.max(RH_MIN, Math.min(RH_MAX, Math.floor(BODY_H / (rows.length * 2))));
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.textBaseline = "middle";
  rect(0, 0, PAGE_W, PAGE_H, "#ffffff");

  // หัวกระดาษ
  ctx.fillStyle = C.ink; f(20, 700); text("Project Timeline", P, P + 10);
  const tw = ctx.measureText("Project Timeline").width;
  f(14, 600); ctx.fillStyle = C.ink2; text(col.label, P + tw + 18, P + 11);
  f(12); ctx.fillStyle = C.muted;
  text(`${d.range} · โครงการที่มีแผน/ผลงานในช่วงนี้ ${pg.from}–${pg.to} จาก ${pg.all} · หน้า ${pg.n}/${pg.total}`, PAGE_W - P, P + 11, undefined, "right");
  // ชิปสรุปกลุ่ม + คำอธิบายสี
  let x = P;
  const cy = P + 42;
  f(12);
  for (const c of d.chips) {
    const w = ctx.measureText(c.t).width + 22;
    rect(x, cy - 12, w, 24, C.head);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, cy - 11.5, w - 1, 23);
    rect(x, cy - 12, 4, 24, GROUP[c.g].chip);
    ctx.fillStyle = C.ink; text(c.t, x + 12, cy);
    x += w + 8;
  }
  x += 10;
  f(11);
  for (const [label, bg, bd] of [["แผน", GROUP.on.plan, ""], ["ตอกได้ตามแผน", C.goodSoft, C.goodInk], ["ต่ำกว่าแผน", C.warnSoft, C.warn], ["มีหมายเหตุ", "#fff", C.line2]] as const) {
    rect(x, cy - 6, 12, 12, bg);
    if (bd) { ctx.strokeStyle = bd; ctx.strokeRect(x + 0.5, cy - 5.5, 11, 11); }
    if (label === "มีหมายเหตุ") tri(ctx, x + 12, cy - 6, 6);
    ctx.fillStyle = C.muted; text(label, x + 16, cy);
    x += 16 + ctx.measureText(label).width + 12;
  }

  // ตาราง
  const T = P + HEAD_H;
  const dx = P + LEFT; // x เริ่มช่องวัน
  const nDays = col.b - col.a;
  const R = dx + nDays * DW; // ขอบขวา
  const bodyTop = T + MON_H + DAY_H;
  const bottom = bodyTop + rows.length * RH * 2;

  // หัวตาราง
  rect(P, T, R - P, MON_H + DAY_H, C.head);
  const labels = ["โครงการ / ลูกค้า", "สั่งซื้อ", "คงเหลือ", "Ahead/", "วันที่"];
  const subs = ["", "ต้น", "ต้น", "Behind", ""];
  let cx = P;
  COLS.forEach((w, i) => {
    ctx.fillStyle = C.ink2; f(11, 600);
    const right = i > 0 && i < 4;
    text(labels[i], right ? cx + w - 6 : cx + 6, T + MON_H + (subs[i] ? 9 : 18), undefined, right ? "right" : "left");
    if (subs[i]) { f(9.5); ctx.fillStyle = C.muted; text(subs[i], right ? cx + w - 6 : cx + 6, T + MON_H + 22, undefined, right ? "right" : "left"); }
    cx += w;
  });
  for (const m of d.months) {
    if (m.b <= col.a || m.a >= col.b) continue;
    const mx = dx + (Math.max(m.a, col.a) - col.a) * DW;
    ctx.fillStyle = C.ink; f(12.5, 600); text(m.label, mx + 8, T + MON_H / 2);
  }
  for (let i = col.a; i < col.b; i++) {
    const day = d.days[i], x0 = dx + (i - col.a) * DW, xm = x0 + DW / 2;
    if (day.today) rect(x0, T + MON_H, DW, DAY_H, C.accent);
    ctx.fillStyle = day.today ? "#fff" : day.sun ? C.badInk : C.ink2; f(11, 600); text(day.n, xm, T + MON_H + 10, undefined, "center");
    ctx.fillStyle = day.today ? "#fff" : C.muted; f(8.5); text(day.w, xm, T + MON_H + 22, undefined, "center");
    if (day.note) { ctx.fillStyle = C.warn; ctx.beginPath(); ctx.arc(xm, T + MON_H + 28, 2, 0, Math.PI * 2); ctx.fill(); }
  }

  // แถวโครงการ
  rows.forEach((p, k) => {
    const y = bodyTop + k * RH * 2;
    const yA = y + RH;
    // ช่องวัน
    if (p.none != null) {
      ctx.fillStyle = C.muted; f(11, 400, true); text(p.none, dx + 10, y + RH, R - dx - 20);
    } else {
      for (let i = col.a; i < col.b; i++) {
        const x0 = dx + (i - col.a) * DW, xm = x0 + DW / 2;
        const pl = p.plan[i], ac = p.act[i];
        if (d.days[i].sun) rect(x0, y, DW, RH * 2, C.sun);
        if (pl?.t) {
          rect(x0, y, DW, RH, GROUP[p.g].plan);
          ctx.fillStyle = C.ink; f(11, 600); text(pl.t, xm, y + RH / 2 + 0.5, DW - 2, "center");
        }
        if (ac?.t) {
          const ok = ac.c.contains("ok"), low = ac.c.contains("low");
          if (ok || low) rect(x0, yA, DW, RH, ok ? C.goodSoft : C.warnSoft);
          ctx.fillStyle = ok ? C.goodInk : low ? C.warnInk : C.ink; f(11, 600); text(ac.t, xm, yA + RH / 2 + 0.5, DW - 2, "center");
        }
        if (ac?.c.contains("nt")) tri(ctx, x0 + DW, yA, 7);
        vline(x0 + DW, y, y + RH * 2, C.line);
      }
      hline(dx, R, yA, C.line);
    }
    // คอลัมน์ซ้าย
    const g = GROUP[p.g];
    f(11, 700);
    const cw = ctx.measureText(p.code).width + 12;
    ctx.fillStyle = g.chip; roundRect(ctx, P + 6, y + RH - 16, cw, 15, 4); ctx.fill();
    ctx.fillStyle = g.chipInk; text(p.code, P + 12, y + RH - 8);
    ctx.fillStyle = C.ink; f(11, 600);
    const nx = P + 6 + cw + 6, nMax = COLS[0] - (nx - P) - 6;
    const name = clip(ctx, p.name, nMax);
    text(name, nx, y + RH - 8);
    const nw = ctx.measureText(name).width;
    if (p.sub && nw + 20 < nMax) { f(10); ctx.fillStyle = C.muted; text(p.sub, nx + nw + 5, y + RH - 8, nMax - nw - 5); }
    f(10); ctx.fillStyle = C.muted; text(p.meta.trim(), P + 6, y + RH + 9, COLS[0] - 12);
    let x1 = P + COLS[0];
    ctx.fillStyle = C.ink; f(11); text(p.order, x1 + COLS[1] - 6, y + RH, undefined, "right");
    x1 += COLS[1];
    f(11.5, 700); text(p.remain, x1 + COLS[2] - 6, p.remainSub ? y + RH - 6 : y + RH, undefined, "right");
    if (p.remainSub) { f(9.5); ctx.fillStyle = C.muted; text(p.remainSub, x1 + COLS[2] - 6, y + RH + 8, undefined, "right"); }
    x1 += COLS[2];
    ctx.fillStyle = p.ab === "–" ? C.muted : p.abUp ? C.goodInk : C.badInk; f(12, 700); text(p.ab, x1 + COLS[3] - 6, y + RH, undefined, "right");
    x1 += COLS[3];
    ctx.fillStyle = C.muted; f(10); text("Plan", x1 + 6, y + RH / 2); text("Actual", x1 + 6, yA + RH / 2);
    hline(x1, P + LEFT, yA, C.line);
    // เส้นคั่นโครงการ / กลุ่ม
    if (k > 0 && rows[k - 1].g !== p.g) hline(P, R, y, C.line2, 3);
    hline(P, R, y + RH * 2, C.line2);
  });

  // เส้นแนวตั้ง: วันนี้, ต้นเดือน, คอลัมน์ซ้าย, กรอบ
  for (let i = col.a; i < col.b; i++) {
    const x0 = dx + (i - col.a) * DW;
    if (d.days[i].today) { vline(x0, bodyTop, bottom, C.accent); vline(x0 + DW, bodyTop, bottom, C.accent); }
    if (i > col.a && d.months.some((m) => m.a === i)) vline(x0, T, bottom, C.line2, 2);
  }
  hline(P, R, T + MON_H + DAY_H, C.line2);
  cx = P;
  COLS.forEach((w, i) => { cx += w; vline(cx, T + (i === 4 ? 0 : MON_H), bottom, C.line2, i === 4 ? 2 : 1); });
  ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.strokeRect(P + 0.5, T + 0.5, R - P - 1, bottom - T - 1);
}

function tri(ctx: CanvasRenderingContext2D, right: number, top: number, s: number) {
  ctx.fillStyle = C.bad;
  ctx.beginPath(); ctx.moveTo(right - s, top); ctx.lineTo(right, top); ctx.lineTo(right, top + s); ctx.closePath(); ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function clip(ctx: CanvasRenderingContext2D, t: string, max: number) {
  if (ctx.measureText(t).width <= max) return t;
  let lo = 0, hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(t.slice(0, mid) + "…").width <= max) lo = mid; else hi = mid - 1;
  }
  return t.slice(0, lo) + "…";
}
