import type * as XLSX from "xlsx";
import { num, parseDate, PROJECT_CODE, sheetRows, str, type Cell } from "./excel";

// ไฟล์ "รายงานคิว-วัน" จากทีมตอก (ไฟล์สะสมทั้งปี รูปแบบเดิมทุกวัน)

export type QueueRow = {
  work_date: string; project_code: string; owner_name: string; agency: string; province: string;
  project_type: string; job_status: string; leader: string; company_raw: string; rig_name: string;
  rig_type: string; order_qty: number; standard: string; size_code: string; section: number | null;
  length_m: number | null; shift: string; qty: number; cubic_m: number; meters: number; dedupe_key: string;
};
export type QueueParse = { sheet: string; rows: QueueRow[]; errors: { row: number; reason: string }[] };

// หัวคอลัมน์ที่อ่านได้ (รองรับชื่อเรียกต่างกัน)
const HEADERS: Record<string, keyof QueueRow | "shift" | "qty"> = {
  "วันที่": "work_date", "วันที่ตอก": "work_date", "รหัสโครงการ": "project_code", "เจ้าของงาน": "owner_name",
  "หน่วยงาน": "agency", "จังหวัด": "province", "ประเภทโครงการ": "project_type", "สถานะงาน": "job_status",
  "หัวหน้าสาย": "leader", "บริษัท": "company_raw", "ชื่อปั้นจั่น": "rig_name", "ปั้นจั่น": "rig_name",
  "ประเภทปั้นจั่น": "rig_type", "ยอดสั่งซื้อ": "order_qty", "มาตรฐาน": "standard", "ขนาด": "size_code",
  "หน้าตัด": "section", "ความยาว": "length_m", "หมายเหตุ": "shift", "กะ": "shift",
  "ต้น": "qty", "จำนวน": "qty", "จำนวนต้น": "qty", "คิว": "cubic_m", "เมตร": "meters",
};
const REQUIRED: (keyof QueueRow)[] = ["work_date", "project_code", "rig_name", "qty"];

/** คีย์กันซ้ำ: วันที่|โครงการ|ปั้นจั่น|หน้าตัด|ยาว|กะ|ต้น — แถวเหมือนกันในไฟล์เดียวกันนับลำดับ #1 #2 */
export function baseKey(r: Pick<QueueRow, "work_date" | "project_code" | "rig_name" | "section" | "length_m" | "shift" | "qty">): string {
  const n = (v: number | null) => (v == null ? "" : String(Number(v)));
  return [r.work_date, r.project_code, r.rig_name, n(r.section), n(r.length_m), r.shift, n(r.qty)].join("|");
}

export function parseQueue(wb: XLSX.WorkBook): QueueParse {
  for (const name of wb.SheetNames) {
    const aoa = sheetRows(wb, name);
    const hi = aoa.slice(0, 15).findIndex((r) => {
      const h = r.map((c) => str(c));
      return h.includes("รหัสโครงการ") && (h.includes("วันที่") || h.includes("วันที่ตอก"));
    });
    if (hi < 0) continue;
    const idx: Partial<Record<keyof QueueRow, number>> = {};
    aoa[hi].forEach((c, i) => {
      const k = HEADERS[str(c)] as keyof QueueRow | undefined;
      if (k && idx[k] === undefined) idx[k] = i;
    });
    const missing = REQUIRED.filter((k) => idx[k] === undefined);
    if (missing.length) throw new Error(`ไฟล์ขาดคอลัมน์: ${missing.join(", ")}`);
    const g = (r: Cell[], k: keyof QueueRow) => (idx[k] === undefined ? null : r[idx[k]!]);

    const rows: QueueRow[] = [];
    const errors: QueueParse["errors"] = [];
    const seen = new Map<string, number>();
    aoa.slice(hi + 1).forEach((r, i) => {
      const rowNo = hi + 2 + i;
      const d = parseDate(g(r, "work_date"));
      const p = str(g(r, "project_code")).toUpperCase();
      if (!d && !p) return; // แถวว่าง / แถวผลรวม
      const qty = num(g(r, "qty"));
      const rig = str(g(r, "rig_name"));
      let reason = "";
      if (!d) reason = "วันที่อ่านไม่ได้";
      else if (!PROJECT_CODE.test(p)) reason = `รหัสโครงการไม่ถูกต้อง (${p || "ว่าง"})`;
      else if (!rig) reason = "ไม่มีชื่อปั้นจั่น";
      else if (qty == null || qty < 0) reason = "จำนวนต้นไม่ถูกต้อง";
      const shift = str(g(r, "shift")).toUpperCase();
      if (!reason && shift && shift !== "A" && shift !== "B") reason = `กะไม่ถูกต้อง (${shift})`;
      if (reason) { errors.push({ row: rowNo, reason }); return; }
      const row: QueueRow = {
        work_date: d, project_code: p, owner_name: str(g(r, "owner_name")), agency: str(g(r, "agency")),
        province: str(g(r, "province")), project_type: str(g(r, "project_type")), job_status: str(g(r, "job_status")),
        leader: str(g(r, "leader")), company_raw: str(g(r, "company_raw")), rig_name: rig, rig_type: str(g(r, "rig_type")),
        order_qty: num(g(r, "order_qty")) ?? 0, standard: str(g(r, "standard")), size_code: str(g(r, "size_code")),
        section: num(g(r, "section")), length_m: num(g(r, "length_m")), shift, qty: qty!,
        cubic_m: num(g(r, "cubic_m")) ?? 0, meters: num(g(r, "meters")) ?? 0, dedupe_key: "",
      };
      const k = baseKey(row);
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      row.dedupe_key = `${k}#${n}`;
      rows.push(row);
    });
    return { sheet: name, rows, errors };
  }
  throw new Error('ไม่พบหัวตาราง "วันที่" และ "รหัสโครงการ" ในไฟล์ — ใช่ไฟล์รายงานคิว-วันหรือไม่');
}
