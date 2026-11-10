import type * as XLSX from "xlsx";
import { findSheet, num, parseDate, serialToIso, sheetRows, str, type Cell } from "./excel";
import { nearTerm } from "../salesMeeting";

// ไฟล์ "Sales Update dd-mm-yy.xlsx" ประชุมแผนกขายประจำสัปดาห์
// * แท็บ สรุปยอด: เป้า + ยอดขายรายสัปดาห์ต่อเซลล์ (ซ้าย) และยอดขายรายเดือนตามผลิตภัณฑ์ (ขวา)
// * แท็บ Sheet1: เป้ารายเดือนตามผลิตภัณฑ์ทั้งปี
// * แท็บ DATA รวม: รายการงานที่คาดว่าจะได้ (Base / Best / ไม่ได้งาน / ไม่บวกเข้ายอด)
// ค่าเงินในไฟล์เป็นบาท (หน้าจอ Excel แสดงเป็นล้าน) — อ่านคอลัมน์ตามชื่อหัวตาราง

export type SMCategory = "" | "base" | "best" | "lost" | "excluded" | "cancelled";
export type SMMeeting = { meeting_date: string; period_month: string; title: string; week_labels: string[]; remain_label: string };
export type SMPerson = { salesperson: string; sort: number; target: number; weeks: number[]; next_adj: number };
export type SMProduct = { product: string; month: string; actual: number | null; target: number | null };
export type SMPipeline = {
  row_no: number; salesperson: string; product: string; first_quote: string | null; last_quote: string | null;
  customer: string; project: string; value: number; category: SMCategory; expected_month: string | null;
  expected_text: string; status_note: string; start_date: string | null; duration: string;
};
export type SMParse = { meeting: SMMeeting; people: SMPerson[]; products: SMProduct[]; pipeline: SMPipeline[]; warnings: string[] };

const MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_ABBR = ["มค", "กพ", "มีค", "เมย", "พค", "มิย", "กค", "สค", "กย", "ตค", "พย", "ธค"]; // ตัดจุดออกแล้ว
const MONTHS_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export const CATEGORY: Record<string, SMCategory> = {
  base: "base", best: "best", "ไม่ได้งาน": "lost", "ไม่บวกเข้ายอด": "excluded", "ยกเลิก": "cancelled",
};

const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}-01`;
/** ปี 2 หลัก: ≥ 50 = พ.ศ. (70 → 2027), น้อยกว่า = ค.ศ. (26 → 2026) · 4 หลัก พ.ศ. → ค.ศ. */
const fullYear = (y: number) => (y < 100 ? (y >= 50 ? 2500 + y - 543 : 2000 + y) : y > 2400 ? y - 543 : y);

/** วันที่ที่ใช้ได้จริงเท่านั้น (ไฟล์มีพิมพ์ผิด เช่น "17/8/20026", "-") */
function safeDate(v: Cell): string | null {
  const d = parseDate(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = new Date(d + "T00:00:00Z");
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d && d >= "2000-01-01" && d <= "2100-12-31" ? d : null;
}

/** เดือนที่คาดว่าจะได้: "30 ต.ค." / "พ.ย." / "พ.ย. Week 2" / "พ.ค.70" / "ม.ค. 70" — ไม่มีปี = เดือนนั้นครั้งถัดไปนับจากเดือนที่ประชุม */
export function parseExpectedMonth(v: Cell, period: string): string | null {
  if (typeof v === "number") return v > 20000 ? serialToIso(v).slice(0, 8) + "01" : null;
  const s = str(v).replace(/week\s*\d+/gi, "").replace(/[.\s]/g, "");
  const m = s.match(/^(?:\d{1,2})?([฀-๿]+)(\d{2,4})?$/);
  if (!m) return null;
  const mi = MONTHS_ABBR.indexOf(m[1]) >= 0 ? MONTHS_ABBR.indexOf(m[1]) : MONTHS_FULL.indexOf(m[1]);
  if (mi < 0) return null;
  const py = Number(period.slice(0, 4)), pm = Number(period.slice(5, 7)) - 1;
  const y = m[2] ? fullYear(Number(m[2])) : mi < pm ? py + 1 : py;
  return ym(y, mi);
}

/** วันที่ประชุมจากชื่อไฟล์ "Sales Update 29-10-26.xlsx" */
export function meetingDateFromName(name: string): string | null {
  const m = name.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{2,4})/);
  if (!m) return null;
  return safeDate(`${m[1]}/${m[2]}/${fullYear(Number(m[3]))}`);
}

const find = (aoa: Cell[][], test: (s: string) => boolean): [number, number] | null => {
  for (let r = 0; r < aoa.length; r++)
    for (let c = 0; c < (aoa[r]?.length ?? 0); c++) if (test(str(aoa[r][c]))) return [r, c];
  return null;
};
const flat = (s: string) => s.replace(/\s+/g, "");

export function parseSalesMeeting(wb: XLSX.WorkBook, fileName: string, today: string): SMParse {
  const warnings: string[] = [];
  const sumName = findSheet(wb, "สรุปยอด");
  const dataName = findSheet(wb, "DATA รวม");
  if (!sumName || !dataName) throw new Error('ไม่พบแท็บ "สรุปยอด" / "DATA รวม" — ใช่ไฟล์ Sales Update หรือไม่');
  const S = sheetRows(wb, sumName);

  // เดือนที่สรุป: หัวรายงาน "สรุปยอดขาย ประจำเดือน ตุลาคม 2569"
  const meetingDate = meetingDateFromName(fileName) ?? today;
  if (!meetingDateFromName(fileName)) warnings.push(`ชื่อไฟล์ไม่มีวันที่ (dd-mm-yy) — ใช้วันนี้ ${today} เป็นวันประชุม`);
  const tPos = find(S, (s) => s.startsWith("สรุปยอดขาย"));
  const title = tPos ? str(S[tPos[0]][tPos[1]]) : "";
  let period = meetingDate.slice(0, 8) + "01";
  const tm = title.match(new RegExp(`(${MONTHS_FULL.join("|")})\\s*(\\d{4})`));
  if (tm) period = ym(fullYear(Number(tm[2])), MONTHS_FULL.indexOf(tm[1]));

  // ตารางเซลล์: แถวหัว "พนักงาน" + แถวถัดไปเป็นช่วงวันที่ของแต่ละสัปดาห์
  const hPos = find(S, (s) => s === "พนักงาน");
  if (!hPos) throw new Error('แท็บสรุปยอด: ไม่พบหัวตาราง "พนักงาน"');
  const [hr, pc] = hPos;
  const H = S[hr].map((c) => flat(str(c))), H2 = (S[hr + 1] ?? []).map((c) => str(c).replace(/[()]/g, "").trim());
  const targetCol = H.findIndex((h) => h.startsWith("เป้า"));
  const weekCols = H.map((h, i) => (/^ยอดขายสัปดาห์ที่\d/.test(h) ? i : -1)).filter((i) => i >= 0);
  const remainCol = H.findIndex((h, i) => h.startsWith("ประมาณการ") && /\d+-\d+/.test(H2[i] ?? ""));
  const people: SMPerson[] = [];
  for (let r = hr + 2; r < S.length; r++) {
    const name = str(S[r]?.[pc]);
    if (!name || name === "รวม") break;
    people.push({ salesperson: name, sort: people.length, target: num(S[r][targetCol]) ?? 0, weeks: weekCols.map((c) => num(S[r][c]) ?? 0), next_adj: remainCol >= 0 ? num(S[r][remainCol]) ?? 0 : 0 });
  }
  if (!people.length) throw new Error("แท็บสรุปยอด: ไม่พบรายชื่อเซลล์");

  // ยอดขายรายเดือนตามผลิตภัณฑ์ (ฝั่งขวา): "ผลิตภัณฑ์" | มกราคม … เดือนปัจจุบัน
  const products = new Map<string, SMProduct>();
  const key = (p: string, m: string) => `${p}|${m}`;
  const pPos = find(S, (s) => s === "ผลิตภัณฑ์");
  if (pPos) {
    const [pr, pcol] = pPos;
    const year = Number(period.slice(0, 4));
    const mcols: { c: number; m: string }[] = [];
    for (let c = pcol + 1; c < (S[pr]?.length ?? 0); c++) {
      const mi = MONTHS_FULL.indexOf(str(S[pr][c]));
      if (mi < 0) break;
      mcols.push({ c, m: ym(year, mi) });
    }
    for (let r = pr + 1; r < S.length; r++) {
      const p = str(S[r]?.[pcol]);
      if (!p || p === "รวม") break;
      for (const { c, m } of mcols) products.set(key(p, m), { product: p, month: m, actual: num(S[r][c]), target: null });
    }
  } else warnings.push("ไม่พบตารางยอดขายตามผลิตภัณฑ์ในแท็บสรุปยอด");

  // เป้ารายเดือนตามผลิตภัณฑ์ (Sheet1): แถวหัว JAN … DEC
  const tName = wb.SheetNames.find((n) => n !== sumName && n !== dataName && sheetRows(wb, n).some((row) => row.some((c) => str(c).toUpperCase() === "JAN")));
  if (tName) {
    const T = sheetRows(wb, tName);
    const jPos = find(T, (s) => s.toUpperCase() === "JAN")!;
    const year = Number(period.slice(0, 4));
    const mcols = T[jPos[0]].map((c, i) => ({ i, mi: MONTHS_EN.indexOf(str(c).toUpperCase().slice(0, 3)) })).filter((x) => x.mi >= 0);
    for (let r = jPos[0] + 1; r < T.length; r++) {
      const p = str(T[r]?.[jPos[1] - 1]);
      if (!p || !/^[A-Z]{2,4}$/.test(p)) continue;
      for (const { i, mi } of mcols) {
        const m = ym(year, mi), t = num(T[r][i]);
        const o = products.get(key(p, m)) ?? { product: p, month: m, actual: null, target: null };
        o.target = t;
        products.set(key(p, m), o);
      }
    }
  } else warnings.push("ไม่พบแท็บเป้ารายเดือนตามผลิตภัณฑ์ (JAN–DEC)");

  // รายการงานที่คาดว่าจะได้
  const D = sheetRows(wb, dataName);
  const DH = (D[0] ?? []).map((c) => flat(str(c)).toLowerCase());
  const col = (re: RegExp) => DH.findIndex((h) => re.test(h));
  const C = {
    sales: col(/^sales$/), product: col(/^product$/), first: col(/ครั้งแรก/), last: col(/ล่าสุด/), customer: col(/^ลูกค้า/),
    project: col(/^โครงการ/), value: col(/^มูลค่า/), cat: col(/^base\/best/), month: col(/^เดือน/), status: col(/^สถานะ/),
    start: col(/^วันเริ่ม/), duration: col(/^ระยะเวลา/),
  };
  if (C.sales < 0 || C.value < 0 || C.cat < 0) throw new Error('แท็บ DATA รวม: ไม่พบคอลัมน์ "Sales" / "มูลค่า" / "Base/Best"');
  const g = (r: Cell[], i: number) => (i < 0 ? null : r[i]);
  const pipeline: SMPipeline[] = [];
  for (let r = 1; r < D.length; r++) {
    const row = D[r] ?? [];
    if (!row.some((c) => str(c))) continue;
    const catRaw = str(g(row, C.cat));
    const category = CATEGORY[catRaw.toLowerCase()] ?? "";
    if (catRaw && !category) warnings.push(`แถว ${r + 1}: ไม่รู้จักประเภท "${catRaw}" (เก็บเป็นไม่ระบุ)`);
    const mRaw = g(row, C.month);
    pipeline.push({
      row_no: r + 1, salesperson: str(g(row, C.sales)), product: str(g(row, C.product)),
      first_quote: safeDate(g(row, C.first)), last_quote: safeDate(g(row, C.last)),
      customer: str(g(row, C.customer)), project: str(g(row, C.project)), value: num(g(row, C.value)) ?? 0,
      category, expected_month: parseExpectedMonth(mRaw, period), expected_text: str(mRaw) === "-" ? "" : str(mRaw),
      status_note: str(g(row, C.status)), start_date: safeDate(g(row, C.start)), duration: str(g(row, C.duration)),
    });
  }

  // ช่องประมาณการสัปดาห์ในไฟล์ = Σ งาน Base ที่ระบุสัปดาห์/วัน + ตัวเลขที่พิมพ์เพิ่ม → เก็บเฉพาะส่วนที่พิมพ์เพิ่ม
  for (const p of people) {
    const adj = p.next_adj - nearTerm(pipeline.filter((x) => x.salesperson === p.salesperson), period);
    p.next_adj = Math.abs(adj) < 1 ? 0 : Math.round(adj * 100) / 100;
  }
  const remainWeek = remainCol >= 0 ? H[remainCol].match(/สัปดาห์ที่(\d+)/) : null;
  const remainRange = remainCol >= 0 ? H2[remainCol] : "";

  return {
    meeting: {
      meeting_date: meetingDate, period_month: period, title,
      week_labels: weekCols.map((c) => H2[c] ?? ""), remain_label: remainWeek ? `สัปดาห์ที่ ${remainWeek[1]} (${remainRange})` : remainRange,
    },
    people, products: [...products.values()], pipeline, warnings,
  };
}
