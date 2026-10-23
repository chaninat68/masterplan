import { describe, expect, it } from "vitest";
import { num, parseDate, serialToIso, str } from "./excel";
import { baseKey } from "./queue";
import { addDays, fBaht, fDate, weekStart } from "../format";

describe("parseDate", () => {
  it("Excel serial", () => {
    expect(serialToIso(45505)).toBe("2024-08-01");
    expect(parseDate(46024)).toBe("2026-01-02");
  });
  it("พ.ศ. และ ค.ศ. แบบ dd/mm/yyyy", () => {
    expect(parseDate("17/10/2569")).toBe("2026-10-17");
    expect(parseDate("17/10/2026")).toBe("2026-10-17");
    expect(parseDate("5/1/69")).toBe("2026-01-05");
  });
  it("ISO และค่าที่อ่านไม่ได้", () => {
    expect(parseDate("2026-01-05")).toBe("2026-01-05");
    expect(parseDate("abc")).toBe("");
    expect(parseDate(null)).toBe("");
  });
});

describe("str / num", () => {
  it("trim และค่า error ของ Excel เป็นค่าว่าง", () => {
    expect(str(" B")).toBe("B");
    expect(str("#N/A")).toBe("");
    expect(str("Residential ")).toBe("Residential");
  });
  it("ตัวเลขจากข้อความ", () => {
    expect(num("1,234.5")).toBe(1234.5);
    expect(num("x")).toBeNull();
    expect(num(7)).toBe(7);
  });
});

describe("baseKey", () => {
  it("ตัวเลขเท่ากันได้คีย์เดียวกัน (22 กับ 22.0)", () => {
    const a = baseKey({ work_date: "2026-10-19", project_code: "A69-A101", rig_name: "ตั้ม", section: 660, length_m: 22, shift: "A", qty: 6 });
    const b = baseKey({ work_date: "2026-10-19", project_code: "A69-A101", rig_name: "ตั้ม", section: 660.0, length_m: 22.0, shift: "A", qty: 6 });
    expect(a).toBe(b);
    expect(a).toBe("2026-10-19|A69-A101|ตั้ม|660|22|A|6");
  });
});

describe("format", () => {
  it("วันที่ พ.ศ.", () => expect(fDate("2026-10-19")).toBe("19 ต.ค. 69"));
  it("บาทย่อเป็นล้าน", () => expect(fBaht(14_960_000)).toBe("฿14.96 ล้าน"));
  it("วันจันทร์ของสัปดาห์", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
