import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSheets } from "./excel";
import { meetingDateFromName, parseExpectedMonth, parseSalesMeeting } from "./salesMeeting";
import { forecast, nearTerm } from "../salesMeeting";

describe("เดือนที่คาดว่าจะได้", () => {
  const p = "2026-10-01";
  it("ไม่มีปี = ครั้งถัดไปนับจากเดือนที่ประชุม", () => {
    expect(parseExpectedMonth("30 ต.ค.", p)).toBe("2026-10-01");
    expect(parseExpectedMonth("พ.ย.", p)).toBe("2026-11-01");
    expect(parseExpectedMonth("ม.ค.", p)).toBe("2027-01-01");
  });
  it("มีปี พ.ศ. 2 หลัก", () => {
    expect(parseExpectedMonth("พ.ค.70", p)).toBe("2027-05-01");
    expect(parseExpectedMonth("ม.ค. 70", p)).toBe("2027-01-01");
    expect(parseExpectedMonth("มี.ค 70", p)).toBe("2027-03-01");
  });
  it("ข้อความอื่น = ไม่ระบุ", () => {
    expect(parseExpectedMonth("-", p)).toBeNull();
    expect(parseExpectedMonth("งานประมูล", p)).toBeNull();
  });
  it("วันที่ประชุมจากชื่อไฟล์", () => {
    expect(meetingDateFromName("Sales Update 29-10-26.xlsx")).toBe("2026-10-29");
    expect(meetingDateFromName("Sales Update 05-11-69.xlsx")).toBe("2026-11-05");
  });
});

// ไฟล์จริงของผู้ใช้ (ข้ามถ้าไม่มีในเครื่อง) — ผลคำนวณต้องตรงกับสูตรในแท็บ สรุปยอด
const FILE = process.env.SALES_MEETING_XLSX ?? "d:/k.tos/ประชุมแผนก/Y2026/M10/Sales Update 29-10-26.xlsx";
describe.skipIf(!existsSync(FILE))("ไฟล์ Sales Update 29-10-26", () => {
  const b = readFileSync(FILE);
  const r = parseSalesMeeting(readSheets(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), "Sales Update 29-10-26.xlsx", "2026-11-03");
  const M = (n: number) => Math.round(n / 1e4) / 100; // ล้าน 2 ตำแหน่ง

  it("หัวรายงาน / สัปดาห์", () => {
    expect(r.meeting).toMatchObject({ meeting_date: "2026-10-29", period_month: "2026-10-01", remain_label: "30-31 ต.ค." });
    expect(r.meeting.week_labels).toEqual(["1-4 ต.ค.", "5-11 ต.ค.", "12-18 ต.ค.", "19-25 ต.ค.", "26-29 ต.ค."]);
    expect(r.people.map((p) => p.salesperson)).toHaveLength(7);
    expect(r.pipeline.length).toBeGreaterThan(100); // ไฟล์ถูกแก้ต่อหลังประชุม (เดิม 177 → 135 รายการ)
  });

  // ไฟล์ถูกแก้ต่อหลังประชุม: ตรวจเฉพาะเดือน ต.ค. (เดือนถัดไปในไฟล์ไม่นับงาน "พ.ย. Week 2" แต่เว็บนับเข้า พ.ย.)
  it("ประมาณการรายเซลล์ตรงกับไฟล์ (ล้านบาท)", () => {
    const at = (name: string) => {
      const p = r.people.find((x) => x.salesperson === name)!;
      const mtd = p.weeks.reduce((s, w) => s + w, 0);
      return forecast(r.pipeline.filter((x) => x.salesperson === name), r.meeting.period_month, mtd).slice(0, 1).flatMap((f) => [M(f.base), M(f.best)]);
    };
    expect(at("คุณชวลิต")).toEqual([14.37, 14.37]);
    expect(at("คุณชยาวุธ")).toEqual([15.69, 15.69]);
    expect(at("คุณอานันต์")).toEqual([6.99, 6.99]);
  });

  it("เป้ารายเดือนตามผลิตภัณฑ์ (ทั้งปี 852 ล้าน) และยอดขาย ม.ค.", () => {
    expect(M(r.products.reduce((s, x) => s + (x.target ?? 0), 0))).toBe(852);
    expect(M(r.products.find((x) => x.product === "IP" && x.month === "2026-01-01")!.actual!)).toBe(62.82);
  });
});

// ไฟล์ 5 พ.ย. 69: งาน "พ.ย. Week 2" รวมในประมาณการ พ.ย. + ช่อง "ประมาณการ สัปดาห์ที่ 2" (คุณทศธรรมพิมพ์ตัวเลขเอง 2.60)
const FILE2 = process.env.SALES_MEETING_XLSX2 ?? "d:/k.tos/ประชุมแผนก/Y2026/M11/Sales Update 05-11-26.xlsx";
describe.skipIf(!existsSync(FILE2))("ไฟล์ Sales Update 05-11-26", () => {
  const b = readFileSync(FILE2);
  const r = parseSalesMeeting(readSheets(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), "Sales Update 05-11-26.xlsx", "2026-11-06");
  const M = (n: number) => Math.round(n / 1e4) / 100;
  const at = (name: string) => {
    const p = r.people.find((x) => x.salesperson === name)!;
    const mine = r.pipeline.filter((x) => x.salesperson === name);
    const mtd = p.weeks.reduce((s, w) => s + w, 0);
    return [M(nearTerm(mine, r.meeting.period_month, p.next_adj)), ...forecast(mine, r.meeting.period_month, mtd, 3, p.next_adj).flatMap((f) => [M(f.base), M(f.best)])];
  };
  it("หัวช่องประมาณการสัปดาห์", () => expect(r.meeting.remain_label).toBe("สัปดาห์ที่ 2 (6-12 พ.ย.)"));
  it("ตรงกับแท็บ สรุปยอด (ล้านบาท)", () => {
    expect(at("คุณทศธรรม")).toEqual([2.6, 2.6, 2.6, 0, 0, 0, 0]);
    expect(at("คุณชวลิต")).toEqual([3.26, 62.13, 70.25, 19.59, 27.27, 1.98, 13.49]);
    expect(at("คุณชยาวุธ")).toEqual([1.13, 2.38, 79.67, 0, 1.06, 0, 0]);
    expect(at("คุณรจนา")).toEqual([6.12, 31.56, 111.76, 0, 5.64, 0, 2.79]);
  });
});
