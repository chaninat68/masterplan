import * as XLSX from "xlsx";

export type Cell = string | number | boolean | Date | null | undefined;

/** อ่านเฉพาะแท็บที่ต้องใช้ (ไฟล์ SO มี ~58 แท็บ อ่านทั้งหมดจะช้ามาก) */
export function readSheets(buf: ArrayBuffer, sheets?: string[]): XLSX.WorkBook {
  return XLSX.read(new Uint8Array(buf), { type: "array", dense: true, cellDates: false, sheets });
}

export function sheetRows(wb: XLSX.WorkBook, name: string): Cell[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

/** หาแท็บจากชื่อ (ไม่สนช่องว่างหัวท้าย) */
export function findSheet(wb: XLSX.WorkBook, name: string): string | undefined {
  return wb.SheetNames.find((n) => n.trim() === name);
}

const ERR = /^#(N\/A|VALUE!|REF!|ERROR!|DIV\/0!|NAME\?|NULL!|NUM!)/;

/** ข้อความ: trim, ค่า error ของ Excel = ว่าง */
export function str(v: Cell): string {
  if (v == null) return "";
  const s = String(v).trim();
  return ERR.test(s) ? "" : s;
}

/** ตัวเลข: ตัวเลขจริง หรือข้อความตัวเลข (มี , ได้) — อื่นๆ = null */
export function num(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }
  return null;
}

/** Excel serial → yyyy-mm-dd */
export function serialToIso(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 864e5).toISOString().slice(0, 10);
}

/** วันที่จากเซลล์: serial, Date, dd/mm/yyyy (ค.ศ. หรือ พ.ศ.), yyyy-mm-dd */
export function parseDate(v: Cell): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") return v > 20000 && v < 80000 ? serialToIso(v) : "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y > 40 ? 2500 : 2000;
    if (y > 2400) y -= 543;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543;
    return `${y}-${m[2]}-${m[3]}`;
  }
  return "";
}

export const PROJECT_CODE = /^[A-Z]\d{2}-[A-Z]\d{3,4}$/;
