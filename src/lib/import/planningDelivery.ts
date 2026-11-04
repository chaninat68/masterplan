// นำเข้า "แผนการจัดส่ง" สำหรับประชุมประจำเดือน (ไฟล์ นำเข้าอัตราการใช้.xlsx — pivot)
// ตาราง 1: Row Labels | จำนวนต้น | % | ลบ.ม. | %  (ประเภทการก่อสร้าง … Grand Total) + แถว "เฉลี่ย/วัน"
// ตาราง 2: หลังแถวที่มีคำว่า "ผลิตภัณฑ์" = หัวเดียวกัน แถวละผลิตภัณฑ์
// ค้นหัวคอลัมน์จากชื่อ ไม่ยึดตำแหน่ง · แถว Grand Total / % ระบบคำนวณเอง
import type * as XLSX from "xlsx";
import { num, sheetRows, str } from "./excel";

export type DeliveryImport = {
  rate: number | null;
  by_type: { type: string; m3: number | null; piles: number | null }[];
  products: { product: string; m3: number | null; piles: number | null }[];
  sheet: string;
};

const TYPES = ["Industrial", "Commercial", "Residential", "Infrastructure", "Other"];
const normType = (s: string) => TYPES.find((t) => t.toLowerCase() === s.trim().toLowerCase()) ?? s.trim();
const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
const isTotal = (s: string) => /grand\s*total|^รวม|^total$/i.test(s);

export function parsePlanningDelivery(wb: XLSX.WorkBook): DeliveryImport {
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb, name);
    const out: DeliveryImport = { rate: null, by_type: [], products: [], sheet: name };
    let section: "type" | "product" | null = null;
    let seenProductTitle = false;
    let col = { label: 0, piles: -1, m3: -1 };
    for (const row of rows) {
      const cells = (row ?? []).map(str);
      const first = cells.find(Boolean) ?? "";
      if (!first) continue;
      // แถวหัวตาราง
      const pi = cells.findIndex((c) => c.replace(/\s/g, "") === "จำนวนต้น");
      const mi = cells.findIndex((c) => c.replace(/\s/g, "") === "ลบ.ม.");
      if (pi >= 0 && mi >= 0) {
        col = { label: cells.findIndex(Boolean), piles: pi, m3: mi };
        section = seenProductTitle || out.by_type.length ? "product" : "type";
        continue;
      }
      if (first.includes("ผลิตภัณฑ์")) { seenProductTitle = true; section = null; continue; }
      if (/เฉลี่ย/.test(first)) {
        out.rate = r2(num(row[col.piles >= 0 ? col.piles : 1]) ?? cells.slice(1).map((c) => num(c)).find((n) => n != null) ?? null);
        continue;
      }
      if (!section || col.piles < 0) continue;
      const label = cells[col.label];
      if (!label || isTotal(label)) { if (isTotal(label)) section = null; continue; }
      const piles = r2(num(row[col.piles])), m3 = r2(num(row[col.m3]));
      if (piles == null && m3 == null) continue;
      if (section === "type") out.by_type.push({ type: normType(label), piles, m3 });
      else out.products.push({ product: label.trim(), piles, m3 });
    }
    if (out.by_type.length || out.products.length) return out;
  }
  throw new Error("ไม่พบตารางแผนการจัดส่ง — ต้องมีหัวคอลัมน์ 'จำนวนต้น' และ 'ลบ.ม.' (ตารางประเภทการก่อสร้าง และตาราง 5 ผลิตภัณฑ์)");
}
