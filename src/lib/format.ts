// รูปแบบตัวเลข/วันที่ภาษาไทย — เก็บวันที่เป็น ค.ศ. (yyyy-mm-dd) แสดงเป็น พ.ศ.

export const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const TH_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const parts = (iso: string) => iso.slice(0, 10).split("-").map(Number);

/** 2026-10-19 → "19 ต.ค. 69" */
export function fDate(iso?: string | null): string {
  if (!iso) return "–";
  const [y, m, d] = parts(iso);
  return `${d} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}`;
}
/** 2026-10-19 → "19 ต.ค." */
export function fDateShort(iso: string): string {
  const [, m, d] = parts(iso);
  return `${d} ${TH_MONTHS[m - 1]}`;
}
/** 2026-10 → "ต.ค. 69" */
export function fMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}`;
}

export function fNum(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "–";
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: digits });
}
/** ฿1.25 ล้าน หรือ ฿12,345 */
export function fBaht(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  return a >= 1e6 ? `${s}฿${(a / 1e6).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ล้าน` : `${s}฿${fNum(a)}`;
}
/** ฿12,345.00 */
export function fBaht2(n: number | null | undefined): string {
  return "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- วันที่ (คิดแบบ UTC ล้วน ไม่ขึ้นกับ timezone ของเครื่อง) ----------
export function addDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dow = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").getUTCDay();
/** วันจันทร์ของสัปดาห์ */
export const weekStart = (iso: string) => addDays(iso, -((dow(iso) + 6) % 7));
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(a.slice(0, 10) + "T00:00:00Z") - Date.parse(b.slice(0, 10) + "T00:00:00Z")) / 864e5);
/** วันนี้ตามเวลาไทย */
export function todayBangkok(): string {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
}

export const STATUS_LABEL: Record<string, string> = {
  ongoing: "กำลังตอก",
  on_hand: "รอเริ่ม",
  hold: "พักงาน",
  completed: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};
