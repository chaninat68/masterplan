import type * as XLSX from "xlsx";
import { num, parseDate, sheetRows, str, type Cell } from "./excel";

// ไฟล์แผนงานของโครงการเดียว (เช่น "Master Plan - <ลูกค้า>.xlsx" แท็บ Plan):
// แถวหัวตารางมีวันที่เรียงเป็นคอลัมน์ (ใช้แถวที่มีวันที่มากที่สุด) แถวข้างล่าง = จำนวนต้นต่อวัน (หลายแถว เช่น หลายผลิตภัณฑ์ = รวมกัน)
// ข้ามแถวที่ป้ายมีคำว่า "รวม" / "total" / "actual" / "ผลงาน"

export type PlanDay = { date: string; qty: number };
export type PlanParse = { sheet: string; days: PlanDay[]; rows: string[]; total: number; warnings: string[] };

const SKIP = /รวม|total|actual|ผลงาน|สะสม/i;

const asDate = (v: Cell): string => (typeof v === "number" ? (v > 40000 && v < 60000 ? parseDate(v) : "") : v instanceof Date ? parseDate(v) : /\d/.test(str(v)) ? parseDate(v) : "");

function parseSheet(aoa: Cell[][]): { header: number; cols: [number, string][] } | null {
  let best: { header: number; cols: [number, string][] } | null = null;
  aoa.slice(0, 30).forEach((r, i) => {
    const cols = (r ?? []).map((v, c) => [c, asDate(v)] as [number, string]).filter(([, d]) => d);
    if (cols.length >= 3 && (!best || cols.length > best.cols.length)) best = { header: i, cols };
  });
  return best;
}

export function parseProjectPlan(wb: XLSX.WorkBook): PlanParse {
  const warnings: string[] = [];
  let pick: { sheet: string; aoa: Cell[][]; h: NonNullable<ReturnType<typeof parseSheet>> } | null = null;
  for (const name of wb.SheetNames) {
    const aoa = sheetRows(wb, name);
    const h = parseSheet(aoa);
    if (h && (!pick || h.cols.length > pick.h.cols.length)) pick = { sheet: name, aoa, h };
  }
  if (!pick) return { sheet: "", days: [], rows: [], total: 0, warnings: ["ไม่พบแถวหัวตารางที่เป็นวันที่ในไฟล์"] };

  const { aoa, h } = pick;
  const firstDateCol = Math.min(...h.cols.map(([c]) => c));
  const byDate = new Map<string, number>();
  const rows: string[] = [];
  for (let r = h.header + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    if (h.cols.every(([c]) => asDate(row[c]))) continue; // แถววันที่ซ้ำ (เช่น แถววันในสัปดาห์)
    const label = row.slice(0, firstDateCol).map(str).filter((s) => s && num(s) == null).join(" ") || `แถว ${r + 1}`;
    const vals = h.cols.map(([c, d]) => [d, num(row[c])] as const).filter(([, q]) => q != null && q !== 0);
    if (!vals.length) continue;
    if (SKIP.test(label)) { warnings.push(`ข้ามแถว ${r + 1} "${label}"`); continue; }
    if (vals.some(([, q]) => q! < 0)) { warnings.push(`แถว ${r + 1}: มีค่าติดลบ — ข้ามค่านั้น`); }
    rows.push(label);
    for (const [d, q] of vals) if (q! > 0) byDate.set(d, (byDate.get(d) ?? 0) + q!);
  }
  const days = [...byDate].map(([date, qty]) => ({ date, qty })).sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) warnings.push("ไม่พบจำนวนต้นในช่องวันที่");
  // ช่วงวันที่ในไฟล์ (นับวันว่าง/วันหยุดด้วย) — ให้หน้าพรีวิวบอกช่วงที่จะถูกแทนที่
  const dates = h.cols.map(([, d]) => d).sort();
  if (days.length && dates[0] < days[0].date) days.unshift({ date: dates[0], qty: 0 });
  return { sheet: pick.sheet, days, rows, total: days.reduce((s, d) => s + d.qty, 0), warnings };
}
