import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { readSheets } from "./excel";
import { parsePlanningDelivery } from "./planningDelivery";

const wbOf = (aoa: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
  return wb;
};
const H = ["Row Labels", "จำนวนต้น", "%", "ลบ.ม.", "%"];

describe("นำเข้าแผนการจัดส่ง", () => {
  it("ประเภทการก่อสร้าง + เฉลี่ย/วัน + 5 ผลิตภัณฑ์", () => {
    const r = parsePlanningDelivery(wbOf([
      [], H,
      ["Industrial", 4679, 0.57, 7850.6774, 0.75],
      ["residential ", 1814, 0.22, 751.96, 0.07],
      ["Grand Total", 6493, 1, 8602.6, 1],
      [],
      ["เฉลี่ย/วัน", 344.4874],
      [],
      ["5 ผลิตภัณฑ์"], H,
      ["IP35A", 1600, 0.19, 3554.496, 0.34],
      ["SS26", 758, 0.09, 1226.3992, 0.11],
    ]));
    expect(r.rate).toBe(344.49);
    expect(r.by_type).toEqual([
      { type: "Industrial", piles: 4679, m3: 7850.68 },
      { type: "Residential", piles: 1814, m3: 751.96 },
    ]);
    expect(r.products).toEqual([
      { product: "IP35A", piles: 1600, m3: 3554.5 },
      { product: "SS26", piles: 758, m3: 1226.4 },
    ]);
  });
  it("ไม่มีตาราง = แจ้งข้อผิดพลาด", () => {
    expect(() => parsePlanningDelivery(wbOf([["a"]]))).toThrow(/ไม่พบตารางแผนการจัดส่ง/);
  });
});

const FILE = "d:/ประชุม ประจำเดือน/2026/M11/นำเข้าอัตาราการใช้.xlsx";
describe.skipIf(!existsSync(FILE))("ไฟล์จริง นำเข้าอัตราการใช้ (พ.ย. 69)", () => {
  it("ตรงกับตัวเลขในไฟล์", () => {
    const b = readFileSync(FILE);
    const r = parsePlanningDelivery(readSheets(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    expect(r.rate).toBe(344.49);
    expect(r.by_type.map((x) => x.type)).toEqual(["Industrial", "Commercial", "Residential", "Infrastructure"]);
    expect(r.by_type.reduce((s, x) => s + (x.piles ?? 0), 0)).toBe(8122);
    expect(r.products.map((x) => x.product)).toEqual(["IP35A", "IP40A", "SS26", "SS30", "IP26A"]);
  });
});
