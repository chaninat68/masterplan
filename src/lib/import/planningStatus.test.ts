import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { readSheets } from "./excel";
import { parsePlanningStatus } from "./planningStatus";

const wbOf = (aoa: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet3");
  return wb;
};
const H = (u: string) => ["", `หน่วย: ${u}`, "Completed", "Ongoing", "On Hand", "Potential", "Hold", "รวมทั้งหมด"];

describe("นำเข้าตารางสถานะโครงการ", () => {
  it("จำนวน + มูลค่า (บาท → ล้าน), ปีมาก = ปีนี้, ข้ามแถวรวม/%", () => {
    const r = parsePlanningStatus(wbOf([
      H("จำนวนโครงการ"),
      ["ตุลาคม\n2568", "พร้อมตอก", 18, 17, 13, 21, 14, 83],
      ["", "รวม", 18, 17, 13, 21, 14, 83],
      ["ตุลาคม\n2569", "พร้อมตอก", 13, 22, 16, 19, 4, 74],
      ["", "ส่งอย่างเดียว", 34, 17, 16, "", "", 67],
      ["", "", 0.33, 0.27, 0.23, 0.13, 0.02, 1],
      [],
      H("จำนวนมูลค่า"),
      ["ตุลาคม\n2569", "พร้อมตอก", 43509356, 81917275, 21478998.3, 73650122, 2715236],
      ["ตุลาคม\n2568", "รับเอง", 1700, "", "", "", ""],
    ]));
    expect(r.labels).toEqual({ cur: "ตุลาคม 2569", prev: "ตุลาคม 2568" });
    expect(r.counts.cur.ready).toEqual([13, 22, 16, 19, 4]);
    expect(r.counts.cur.ship).toEqual([34, 17, 16, null, null]);
    expect(r.counts.prev.ready).toEqual([18, 17, 13, 21, 14]);
    expect(r.values.cur.ready).toEqual([43.5094, 81.9173, 21.479, 73.6501, 2.7152]);
    expect(r.values.prev.self).toEqual([0.0017, null, null, null, null]);
  });
  it("ไม่มีตาราง = แจ้งข้อผิดพลาด", () => {
    expect(() => parsePlanningStatus(wbOf([["a", "b"]]))).toThrow(/ไม่พบตารางสถานะโครงการ/);
  });
});

const FILE = "d:/ประชุม ประจำเดือน/2026/M11/ทำข้อมูลสถานะโครงการ.xlsx";
describe.skipIf(!existsSync(FILE))("ไฟล์จริง ทำข้อมูลสถานะโครงการ (ต.ค. 69)", () => {
  it("ตรงกับตัวเลขในไฟล์", () => {
    const b = readFileSync(FILE);
    const r = parsePlanningStatus(readSheets(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    expect(r.counts.cur.ready).toEqual([13, 22, 16, 19, 4]);
    expect(r.counts.cur.self).toEqual([1, null, 1, null, null]);
    expect(r.counts.prev.ship).toEqual([38, 6, 20, 1, 1]);
    expect(r.values.cur.ready[0]).toBe(43.5094);
  });
});
