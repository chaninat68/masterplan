import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSheets } from "./excel";
import { parsePnl, splitProject, splitRef } from "./pnl";
import { PNL_LINES, pctOf, revenueOf, sumLines } from "../pnl";

describe("แยกข้อความหัวบล็อก", () => {
  it("รหัส - ลูกค้า", () => {
    expect(splitRef("A69-A031,032 - บริษัท ตัวอย่าง จำกัด")).toEqual({ project_code: "A69-A031", ref_text: "A69-A031,032", customer: "บริษัท ตัวอย่าง จำกัด" });
    expect(splitRef("บริษัท ตัวอย่าง จำกัด")).toEqual({ project_code: "", ref_text: "", customer: "บริษัท ตัวอย่าง จำกัด" });
  });
  it("โครงการ - สถานที่", () => {
    expect(splitProject("อาคาร ก - อ.เมือง  จ.ชลบุรี ")).toEqual({ project: "อาคาร ก", location: "อ.เมือง จ.ชลบุรี" });
    expect(splitProject("อาคาร ข")).toEqual({ project: "อาคาร ข", location: "" });
  });
});

// ไฟล์จริงของผู้ใช้ (ข้ามถ้าไม่มีในเครื่อง)
const FILE = process.env.PNL_XLSX ?? "d:/Project_Masterplan/Profit and Loss.xlsx";
describe.skipIf(!existsSync(FILE))("ไฟล์ Profit and Loss", () => {
  const b = readFileSync(FILE);
  const r = parsePnl(readSheets(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
  const by = (code: string) => r.projects.find((p) => p.project_code === code)!;

  it("94 โครงการ ครบทุกบรรทัด", () => {
    expect(r.sheet).toBe("TS");
    expect(r.projects).toHaveLength(94);
    expect(r.warnings.filter((w) => w.startsWith("ไม่พบบรรทัด"))).toEqual([]);
    expect(r.params.find((p) => p.name === "OH บริหาร")?.value).toBe(700);
  });
  it("โครงการแรก (บล็อก 2 คอลัมน์) และสุดท้าย", () => {
    const a = r.projects[0];
    expect(a).toMatchObject({ project_code: "A67-A002", revenue: 4136115, piles: 464, trips: null });
    expect(Math.round(a.lines.net!)).toBe(25797);
    expect(a.lines.svc_price).toBe(308400);
    const z = by("A69-A134");
    expect(z).toMatchObject({ revenue: 9263910, piles: 751, distance: 140 });
    expect(z.lines.sale).toBe(7609660);
    expect(Math.round(z.lines.net!)).toBe(777616);
  });
  it("จำนวนเที่ยว และ % ตรงกับไฟล์", () => {
    expect(by("A67-A152").trips).toBe(62);
    const a = r.projects[0].lines;
    const pct = (k: string) => pctOf(a, PNL_LINES.find((d) => d.key === k)!)!;
    expect(pct("prod_total")).toBeCloseTo(0.7152562, 6);
    expect(pct("drive_total")).toBeCloseTo(0.9942802, 6);
    expect(pct("net")).toBeCloseTo(0.0062371, 6);
  });
  it("รวมทุกโครงการ: รายได้ = Σ แถวรายได้รวม (ช่องรวมในไฟล์ G6 = 505.88 ล้าน ไม่นับ 4 โครงการสุดท้าย)", () => {
    const t = sumLines(r.projects.map((p) => p.lines));
    expect(Math.round(revenueOf(t))).toBe(Math.round(r.projects.reduce((s, p) => s + (p.revenue ?? 0), 0)));
    expect(Math.round(r.projects.reduce((s, p) => s + (p.revenue ?? 0), 0))).toBe(519848296);
  });
});
