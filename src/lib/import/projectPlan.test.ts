import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseProjectPlan } from "./projectPlan";

const wb = (aoa: unknown[][]) => {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(aoa), "Plan");
  return w;
};

describe("parseProjectPlan", () => {
  it("วันที่เป็นคอลัมน์ รวมหลายแถว ข้ามแถวรวม", () => {
    const r = parseProjectPlan(wb([
      ["No.", "ผลิตภัณฑ์", "จำนวน", "พฤศจิกายน"],
      [null, null, null, 46327, 46328, 46329, 46330],
      [null, null, null, 46327, 46328, 46329, 46330], // แถววันในสัปดาห์ (วันที่ซ้ำ)
      [1, "เสา A", 60, 10, 20, null, 30],
      [2, "เสา B", 5, 5, null, null, null],
      [null, "รวม", 65, 15, 20, null, 30],
    ]));
    expect(r.days).toEqual([
      { date: "2026-11-01", qty: 15 },
      { date: "2026-11-02", qty: 20 },
      { date: "2026-11-04", qty: 30 },
    ]);
    expect(r.total).toBe(65);
    expect(r.rows).toEqual(["เสา A", "เสา B"]);
  });
  it("วันแรกของไฟล์ว่าง = ยังนับเป็นจุดเริ่มแทนที่แผน", () => {
    const r = parseProjectPlan(wb([[null, 46327, 46328, 46329], ["เสา", null, 7, 7]]));
    expect(r.days[0]).toEqual({ date: "2026-11-01", qty: 0 });
    expect(r.total).toBe(14);
  });
});
