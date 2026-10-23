import type * as XLSX from "xlsx";
import { findSheet, num, parseDate, PROJECT_CODE, serialToIso, sheetRows, str } from "./excel";

// ไฟล์ Master Planning แท็บ Pile: แต่ละโครงการ 2 แถว (Plan / Actual) + คอลัมน์วันที่แนวกว้างเริ่มคอลัมน์ R

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
};

const STATUS: Record<string, string> = {
  "1-Ongoing": "ongoing", "2-On Hand": "on_hand", "3-Hold": "hold", "5-Completed": "completed", "6-ยกเลิก": "cancelled",
};
// คอลัมน์ (0-based): A รหัส, B PM, C Sales, D สถานะ, E ลูกค้า (แถว Actual = รอบส่งมอบ), F โครงการ, G สั่งซื้อ,
// H มูลค่า, I มูลค่า/ต้น, O เริ่ม, P เสร็จ, Q Plan/Actual, R.. วันที่
const C = { code: 0, pm: 1, sales: 2, status: 3, customer: 4, name: 5, order: 6, value: 7, vpp: 8, start: 14, end: 15, kind: 16 };

/** legacyBefore: Actual จากไฟล์นี้ใช้เฉพาะวันก่อนวันนี้ (หลังจากนั้นคิว-วันคือตัวจริง) */
export function parseMasterPlanning(wb: XLSX.WorkBook, legacyBefore: string): MPParse {
  const name = findSheet(wb, "Pile");
  if (!name) throw new Error('ไม่พบแท็บ "Pile" — ใช่ไฟล์ Master Planning หรือไม่');
  const aoa = sheetRows(wb, name);
  const hi = aoa.slice(0, 10).findIndex((r) => str(r[C.kind]) === "วันที่" || str(r[C.code]).startsWith("รหัส"));
  if (hi < 0) throw new Error("ไม่พบแถวหัวตาราง (รหัสโครงการ / วันที่) ในแท็บ Pile");
  const dateCols: { i: number; d: string }[] = [];
  aoa[hi].forEach((c, i) => {
    if (i > C.kind && typeof c === "number" && c > 20000) dateCols.push({ i, d: serialToIso(c) });
  });
  if (!dateCols.length) throw new Error("ไม่พบคอลัมน์วันที่ในแถวหัวตาราง");

  const projects = new Map<string, MPProject>();
  const plans: MPParse["plans"] = [];
  const legacy: MPParse["legacy"] = [];
  const notes: MPParse["notes"] = [];
  for (const r of aoa.slice(hi + 1)) {
    const code = str(r[C.code]).toUpperCase();
    const kind = str(r[C.kind]);
    if (!PROJECT_CODE.test(code) || (kind !== "Plan" && kind !== "Actual")) continue;
    if (kind === "Plan") {
      projects.set(code, {
        code, pm: str(r[C.pm]), sales: str(r[C.sales]), status: STATUS[str(r[C.status])] ?? "completed",
        customer_name: str(r[C.customer]), project_name: str(r[C.name]), order_qty: Math.max(0, num(r[C.order]) ?? 0),
        contract_value: num(r[C.value]) ?? 0, value_per_pile: num(r[C.vpp]) ?? 0,
        start_date: parseDate(r[C.start]) || null, end_date: parseDate(r[C.end]) || null,
        billing_cycle: projects.get(code)?.billing_cycle ?? "", end_note: projects.get(code)?.end_note ?? "",
      });
      for (const { i, d } of dateCols) {
        const q = num(r[i]);
        if (q && q > 0) plans.push({ c: code, d, q });
      }
    } else {
      const p = projects.get(code);
      if (p) {
        p.billing_cycle = str(r[C.customer]);
        const endTxt = str(r[C.end]);
        if (endTxt && !parseDate(r[C.end])) p.end_note = endTxt;
      }
      for (const { i, d } of dateCols) {
        const v = r[i];
        const q = num(v);
        if (q != null) {
          if (q > 0 && d < legacyBefore) legacy.push({ c: code, d, q });
        } else {
          const t = str(v);
          if (t) notes.push({ c: code, d, b: t.toLowerCase() === "x" ? "ไม่มีการตอก" : t });
        }
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
  };
}
