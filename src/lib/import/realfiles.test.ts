import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSheets } from "./excel";
import { parseMasterPlanning } from "./masterPlanning";
import { parseQueue } from "./queue";
import { parseSales } from "./sales";

// ตรวจ parser กับไฟล์จริงตามเกณฑ์รับงานใน docs/PRD.md — ข้ามอัตโนมัติถ้าเครื่องนี้ไม่มีไฟล์
const FILES = {
  queue: process.env.QUEUE_XLSX ?? "C:/Users/s_chaninat.ASIAGROUP/Desktop/รายงานคิว-วัน-ปี 69.xlsx",
  mp: process.env.MP_XLSX ?? "D:/Master Planning/Master Planning 2026/M10/Master Planning Update 17-10-69 - Copy.xlsx",
  sales: process.env.SALES_XLSX ?? "C:/Users/s_chaninat.ASIAGROUP/Desktop/ข้อมูล SO และใบเปลี่ยนแปลง ปี 2026.xlsx",
};
const load = (p: string, sheets?: string[]) => {
  const b = readFileSync(p);
  return readSheets(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, sheets);
};

describe.skipIf(!existsSync(FILES.queue))("ไฟล์คิว-วัน", () => {
  it("ยอดรวม 61,434 ต้น และคีย์ไม่ซ้ำ", () => {
    const r = parseQueue(load(FILES.queue));
    const total = r.rows.reduce((s, x) => s + x.qty, 0);
    expect(Math.round(total)).toBe(61434);
    expect(new Set(r.rows.map((x) => x.dedupe_key)).size).toBe(r.rows.length);
    expect(r.errors.length).toBeLessThan(10);
  }, 120_000);
});

describe.skipIf(!existsSync(FILES.mp))("ไฟล์ Master Planning", () => {
  it("404 โครงการ และสถานะตรง", () => {
    const r = parseMasterPlanning(load(FILES.mp, ["Pile"]), "2026-01-01");
    expect(r.projects.length).toBeGreaterThanOrEqual(403);
    const ongoing = r.projects.filter((p) => p.status === "ongoing").length;
    expect(ongoing).toBe(16);
    const a208 = r.projects.find((p) => p.code === "A69-A208")!;
    expect(a208.order_qty).toBe(1530);
    expect(a208.billing_cycle).toContain("ส่งมอบ");
    expect(r.notes.some((n) => n.b === "ไม่มีการตอก")).toBe(true);
  }, 120_000);
});

describe.skipIf(!existsSync(FILES.sales))("ไฟล์ SO", () => {
  it("P 2,247 / R 374 / C 186", () => {
    const r = parseSales(load(FILES.sales, ["dataรวม"]));
    const n = (t: string) => r.docs.filter((d) => d.doc_type === t).length;
    expect([n("P"), n("R"), n("C")]).toEqual([2247, 374, 186]);
  }, 300_000);
});
