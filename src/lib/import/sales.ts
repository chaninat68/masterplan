import type * as XLSX from "xlsx";
import { findSheet, num, parseDate, sheetRows, str, type Cell } from "./excel";

// ไฟล์ "ข้อมูล SO และใบเปลี่ยนแปลง" แท็บ dataรวม — P = เปิดยอดขาย, R/C = ลด/เปลี่ยนแปลง (จำนวน/มูลค่าเป็นค่าลบในไฟล์)

export type SalesDoc = {
  doc_type: "P" | "R" | "C"; doc_date: string; so_code: string; project_code: string; project_name: string;
  customer_code: string; customer_name: string; customer_group: string; item_code: string; item_name: string;
  item_kind: string; product: string; group_product: string; section: number | null; standard: string;
  pile_form: string; length_m: number | null; qty: number; unit_price: number; install_fee: number; amount: number;
  m3: number; approval_status: string; work_status: string; salesperson: string; service_type: string;
  construction_type: string; province: string; is_new_customer: boolean;
};
export type Customer = { code: string; name: string; customer_group: string; registered_at: string | null };
export type SalesParse = { docs: SalesDoc[]; customers: Customer[]; from: string; to: string; skipped: number };

// กลุ่มลูกค้าในไฟล์ปนไทย/อังกฤษ
const GROUP: Record<string, string> = {
  Contractor: "ผู้รับเหมา", "Sub Contractor": "ผู้รับเหมา", "ผู้รับเหมา": "ผู้รับเหมา",
  Owner: "เจ้าของงาน", "เจ้าของงาน": "เจ้าของงาน", "Materials Shop": "ร้านวัสดุ", "ร้านวัสดุ": "ร้านวัสดุ",
  Developer: "Developer", "บริษัท/หน่วยงาน": "บริษัท/หน่วยงาน",
};
export const normGroup = (g: string) => GROUP[g] ?? "ไม่ระบุ";

const COLS = {
  type: "เอกสาร", date: "วันที่", so: "รหัส SO", project: "รหัสโครงการ", pname: "โครงการ", ccode: "รหัสลูกค้า",
  cname: "ชื่อลูกค้า", group: "กลุ่มลูกค้า", icode: "รหัสสินค้า/บริการ", iname: "ชื่อสินค้า/บริการ", section: "หน้าตัด",
  standard: "มาตรฐาน", form: "รูปแบบ", length: "ยาว", qty: "จำนวน", price: "ราคาต่อหน่วย", fee: "ค่าติดตั้ง",
  amount: "มูลค่า", appr: "สถานะ", work: "สถานะงาน", creg: "วันที่ลงทะเบียนลูกค้า", kind: "ประเภทรายการ",
  m3: "m3", product: "Product", gp: "Group product", isNew: "ลูกค้าใหม่", sales: "sales", svc: "บริการ",
  construction: "ประเภทงานก่อสร้าง App", province: "จังหวัด",
} as const;

export function parseSales(wb: XLSX.WorkBook): SalesParse {
  const name = findSheet(wb, "dataรวม");
  if (!name) throw new Error('ไม่พบแท็บ "dataรวม" — ใช่ไฟล์ข้อมูล SO หรือไม่');
  const aoa = sheetRows(wb, name);
  const header = (aoa[0] ?? []).map((c) => str(c));
  const idx = {} as Record<keyof typeof COLS, number>;
  for (const [k, h] of Object.entries(COLS)) idx[k as keyof typeof COLS] = header.indexOf(h);
  const need: (keyof typeof COLS)[] = ["type", "date", "project", "qty", "amount"];
  const missing = need.filter((k) => idx[k] < 0).map((k) => COLS[k]);
  if (missing.length) throw new Error(`แท็บ dataรวม ขาดคอลัมน์: ${missing.join(", ")}`);
  const g = (r: Cell[], k: keyof typeof COLS) => (idx[k] < 0 ? null : r[idx[k]]);

  const docs: SalesDoc[] = [];
  const customers = new Map<string, Customer>();
  let skipped = 0;
  for (const r of aoa.slice(1)) {
    const t = str(g(r, "type"));
    const d = parseDate(g(r, "date"));
    if ((t !== "P" && t !== "R" && t !== "C") || !d) { if (t || d) skipped++; continue; }
    const ccode = str(g(r, "ccode"));
    const group = normGroup(str(g(r, "group")));
    if (ccode && !customers.has(ccode))
      customers.set(ccode, { code: ccode, name: str(g(r, "cname")) || ccode, customer_group: group, registered_at: parseDate(g(r, "creg")) || null });
    docs.push({
      doc_type: t, doc_date: d, so_code: str(g(r, "so")), project_code: str(g(r, "project")).toUpperCase(),
      project_name: str(g(r, "pname")), customer_code: ccode, customer_name: str(g(r, "cname")), customer_group: group,
      item_code: str(g(r, "icode")), item_name: str(g(r, "iname")), item_kind: str(g(r, "kind")),
      product: str(g(r, "product")), group_product: str(g(r, "gp")), section: num(g(r, "section")),
      standard: str(g(r, "standard")), pile_form: str(g(r, "form")), length_m: num(g(r, "length")),
      qty: num(g(r, "qty")) ?? 0, unit_price: num(g(r, "price")) ?? 0, install_fee: num(g(r, "fee")) ?? 0,
      amount: num(g(r, "amount")) ?? 0, m3: num(g(r, "m3")) ?? 0, approval_status: str(g(r, "appr")),
      work_status: str(g(r, "work")), salesperson: str(g(r, "sales")), service_type: str(g(r, "svc")),
      construction_type: str(g(r, "construction")), province: str(g(r, "province")),
      is_new_customer: str(g(r, "isNew")) === "ลูกค้าใหม่",
    });
  }
  if (!docs.length) throw new Error("ไม่พบเอกสาร P/R/C ในแท็บ dataรวม");
  const dates = docs.map((x) => x.doc_date).sort();
  return { docs, customers: [...customers.values()], from: dates[0], to: dates[dates.length - 1], skipped };
}
