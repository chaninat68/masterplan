import type * as XLSX from "xlsx";
import { findSheet, num, parseDate, PROJECT_CODE, serialToIso, sheetRows, str, type Cell } from "./excel";

// ไฟล์ Master Planning / ไฟล์แผน แท็บ Pile: คอลัมน์ข้อมูลโครงการ + คอลัมน์ "วันที่" (Plan/Actual) + วันที่แนวกว้าง
// อ่านคอลัมน์ตามชื่อหัวตาราง รองรับทั้งไฟล์ Master Planning เดิม (แถว Plan + Actual) และไฟล์แผนอย่างเดียว (Plan.xlsx)

export type MPProject = {
  code: string; pm: string; sales: string; status: string; customer_name: string; project_name: string;
  order_qty: number; contract_value: number; value_per_pile: number; start_date: string | null;
  end_date: string | null; billing_cycle: string; end_note: string;
};
export type MPParse = {
  projects: MPProject[];
  plans: { c: string; d: string; q: number }[];
  legacy: { c: string; d: string; q: number }[];
  notes: { c: string; d: string; b: string }[];
  dateFrom: string; dateTo: string;
  /** ไฟล์มีแถว Actual หรือไม่ — ไม่มี = ไม่แตะ Actual ก่อนปี 69 ที่มีอยู่ */
  hasActual: boolean;
};

const STATUS: Record<string, string> = {
  "1-Ongoing": "ongoing", "2-On Hand": "on_hand", "3-Hold": "hold", "5-Completed": "completed", "6-ยกเลิก": "cancelled",
};
// ชื่อหัวตาราง (ตัดช่องว่าง/ขึ้นบรรทัดออกก่อนเทียบ) → ฟิลด์
const HEAD: [keyof typeof EMPTY, RegExp][] = [
  ["code", /^รหัส/], ["pm", /^PM/i], ["sales", /^Sales/i], ["status", /^สถานะ$/], ["customer", /^ชื่อลูกค้า/],
  ["name", /^โครงการ$/], ["order", /^สั่งซื้อ/], ["vpp", /^มูลค่าเฉลี่ย/], ["value", /^มูลค่าโครงการ/],
  ["start", /^กำหนดเริ่ม/], ["end", /^กำหนดแล้วเสร็จ/], ["cond", /^(เงื่อนไข|รอบส่งมอบ|รอบวางบิล)/], ["kind", /^วันที่$/],
];
const EMPTY = { code: -1, pm: -1, sales: -1, status: -1, customer: -1, name: -1, order: -1, vpp: -1, value: -1, start: -1, end: -1, cond: -1, kind: -1 };
// ข้อความในช่องวันที่ที่ไม่ใช่หมายเหตุ
const SKIP_TEXT = new Set([">"]);

/** legacyBefore: Actual จากไฟล์นี้ใช้เฉพาะวันก่อนวันนี้ (หลังจากนั้นคิว-วันคือตัวจริง) */
export function parseMasterPlanning(wb: XLSX.WorkBook, legacyBefore: string): MPParse {
  const name = findSheet(wb, "Pile");
  if (!name) throw new Error('ไม่พบแท็บ "Pile" — ใช่ไฟล์ Master Planning หรือไม่');
  const aoa = sheetRows(wb, name);
  const hi = aoa.slice(0, 10).findIndex((r) => str(r[0]).startsWith("รหัส"));
  if (hi < 0) throw new Error("ไม่พบแถวหัวตาราง (รหัสโครงการ) ในแท็บ Pile");
  const C = { ...EMPTY };
  aoa[hi].forEach((h, i) => {
    const t = str(h).replace(/\s+/g, "");
    const hit = HEAD.find(([k, re]) => C[k] < 0 && re.test(t));
    if (hit) C[hit[0]] = i;
  });
  if (C.kind < 0) throw new Error('ไม่พบคอลัมน์ "วันที่" (ช่อง Plan / Actual) ในแถวหัวตาราง');
  const dateCols: { i: number; d: string }[] = [];
  aoa[hi].forEach((c, i) => {
    if (i > C.kind && typeof c === "number" && c > 20000) dateCols.push({ i, d: serialToIso(c) });
  });
  if (!dateCols.length) throw new Error("ไม่พบคอลัมน์วันที่ในแถวหัวตาราง");
  const col = (r: Cell[], k: keyof typeof EMPTY) => (C[k] < 0 ? null : r[C[k]]);

  const projects = new Map<string, MPProject>();
  const plans: MPParse["plans"] = [];
  const legacy: MPParse["legacy"] = [];
  const notes: MPParse["notes"] = [];
  const addNote = (code: string, d: string, v: Cell) => {
    const t = str(v);
    if (t && !SKIP_TEXT.has(t)) notes.push({ c: code, d, b: t.toLowerCase() === "x" ? "ไม่มีการตอก" : t });
  };
  let hasActual = false;
  for (const r of aoa.slice(hi + 1)) {
    const code = str(r[C.code]).toUpperCase();
    const kind = str(r[C.kind]);
    if (!PROJECT_CODE.test(code) || (kind !== "Plan" && kind !== "Actual")) continue;
    if (kind === "Plan") {
      const order = Math.max(0, num(col(r, "order")) ?? 0), value = num(col(r, "value")) ?? 0;
      projects.set(code, {
        code, pm: str(col(r, "pm")), sales: str(col(r, "sales")), status: STATUS[str(col(r, "status"))] ?? "completed",
        customer_name: str(col(r, "customer")), project_name: str(col(r, "name")), order_qty: order, contract_value: value,
        value_per_pile: num(col(r, "vpp")) || (order > 0 ? value / order : 0),
        start_date: parseDate(col(r, "start")) || null, end_date: parseDate(col(r, "end")) || null,
        billing_cycle: str(col(r, "cond")) || (projects.get(code)?.billing_cycle ?? ""), end_note: projects.get(code)?.end_note ?? "",
      });
      for (const { i, d } of dateCols) {
        const q = num(r[i]);
        if (q != null) { if (q > 0) plans.push({ c: code, d, q }); }
        else addNote(code, d, r[i]);
      }
    } else {
      hasActual = true;
      const p = projects.get(code);
      if (p) {
        // ไฟล์ Master Planning เดิม: คอลัมน์ลูกค้าของแถว Actual = เงื่อนไขส่งมอบงาน
        if (!p.billing_cycle) p.billing_cycle = str(col(r, "customer"));
        const endTxt = str(col(r, "end"));
        if (endTxt && !parseDate(col(r, "end"))) p.end_note = endTxt;
      }
      for (const { i, d } of dateCols) {
        const q = num(r[i]);
        if (q != null) { if (q > 0 && d < legacyBefore) legacy.push({ c: code, d, q }); }
        else addNote(code, d, r[i]);
      }
    }
  }
  return {
    projects: [...projects.values()],
    plans: plans.filter((x) => projects.has(x.c)),
    legacy: legacy.filter((x) => projects.has(x.c)),
    notes: notes.filter((x) => projects.has(x.c)),
    dateFrom: dateCols[0].d,
    dateTo: dateCols[dateCols.length - 1].d,
    hasActual,
  };
}
