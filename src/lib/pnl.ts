// Profit and Loss รายโครงการ (ไฟล์ Profit and Loss.xlsx แท็บ TS)
// % ของแต่ละส่วนคิดจากราคาของส่วนนั้น: ผลิต/ขนส่ง ÷ ราคาขายเสาเข็ม, ตอก ÷ ราคาค่าตอก, บริการ ÷ ราคาค่าบริการ
// กำไรจากการดำเนินงาน / กำไรสุทธิ ÷ รายได้รวม (ขาย + ตอก + บริการ) — ตรงกับคอลัมน์ "% ราคาขาย" ในไฟล์

export type PnlKey =
  | "sale" | "prod_total" | "prod_cost" | "oh_prod" | "prod_profit"
  | "transport" | "trip" | "fuel" | "tire" | "repair" | "oh_transport" | "gross"
  | "drive_price" | "drive_total" | "drive_cost" | "oh_drive" | "drive_profit"
  | "svc_price" | "svc_cost" | "svc_profit"
  | "operating" | "damaged" | "footing" | "oh_admin" | "net";

export type Base = "sale" | "drive_price" | "svc_price" | "revenue";
export type LineDef = { key: PnlKey; label: string; match: RegExp; base: Base; level: 0 | 1 | 2; kind: "rev" | "cost" | "profit" };

export const PNL_LINES: LineDef[] = [
  { key: "sale", label: "ราคาขายเสาเข็ม", match: /^ราคาขายเสาเข็ม/, base: "sale", level: 0, kind: "rev" },
  { key: "prod_total", label: "รวมต้นทุนผลิต", match: /^รวมต้นทุนผลิต/, base: "sale", level: 1, kind: "cost" },
  { key: "prod_cost", label: "ต้นทุนผลิต", match: /^ต้นทุนผลิต/, base: "sale", level: 2, kind: "cost" },
  { key: "oh_prod", label: "OH ผลิต", match: /^OH ?ผลิต/, base: "sale", level: 2, kind: "cost" },
  { key: "prod_profit", label: "กำไร (ขาดทุน) จากการผลิต", match: /^กำไร.*จากการผลิต/, base: "sale", level: 0, kind: "profit" },
  { key: "transport", label: "ต้นทุนขนส่ง + รถร่วม", match: /^ต้นทุนขนส่ง/, base: "sale", level: 1, kind: "cost" },
  { key: "trip", label: "ค่าเที่ยว", match: /^ค่าเที่ยว/, base: "sale", level: 2, kind: "cost" },
  { key: "fuel", label: "ค่าน้ำมัน", match: /^ค่าน้ำมัน/, base: "sale", level: 2, kind: "cost" },
  { key: "tire", label: "ค่ายาง", match: /^ค่ายาง/, base: "sale", level: 2, kind: "cost" },
  { key: "repair", label: "ค่าซ่อม", match: /^ค่าซ่อม/, base: "sale", level: 2, kind: "cost" },
  { key: "oh_transport", label: "OH ขนส่ง", match: /^OH ?ขนส่ง/, base: "sale", level: 2, kind: "cost" },
  { key: "gross", label: "กำไร (ขาดทุน) ขั้นต้น Gross Profit", match: /^กำไร.*ขั้นต้น/, base: "sale", level: 0, kind: "profit" },
  { key: "drive_price", label: "ราคาค่าตอก", match: /^ราคาค่าตอก/, base: "drive_price", level: 0, kind: "rev" },
  { key: "drive_total", label: "รวมต้นทุนตอก", match: /^รวมต้นทุนตอก/, base: "drive_price", level: 1, kind: "cost" },
  { key: "drive_cost", label: "ต้นทุนตอก", match: /^ต้นทุน ?ตอก/, base: "drive_price", level: 2, kind: "cost" },
  { key: "oh_drive", label: "OH ตอก", match: /^OH ?ตอก/, base: "drive_price", level: 2, kind: "cost" },
  { key: "drive_profit", label: "กำไร (ขาดทุน) จากการตอก", match: /^กำไร.*จากการตอก/, base: "drive_price", level: 0, kind: "profit" },
  { key: "svc_price", label: "ราคาค่าบริการ", match: /^ราคาค่าบริการ/, base: "svc_price", level: 0, kind: "rev" },
  { key: "svc_cost", label: "ค่าบริการ", match: /^ค่าบริการ/, base: "svc_price", level: 1, kind: "cost" },
  { key: "svc_profit", label: "กำไร (ขาดทุน) จากการบริการ", match: /^กำไร.*จากการบริการ/, base: "svc_price", level: 0, kind: "profit" },
  { key: "operating", label: "กำไร (ขาดทุน) จากการดำเนินงาน", match: /^กำไร.*ดำเนินงาน/, base: "revenue", level: 0, kind: "profit" },
  { key: "damaged", label: "เสาเข็มเสียหาย", match: /^เสาเข็มเสียหาย/, base: "revenue", level: 1, kind: "cost" },
  { key: "footing", label: "ค่าขยายฐานราก", match: /^ค่าขยายฐานราก/, base: "revenue", level: 1, kind: "cost" },
  { key: "oh_admin", label: "OH บริหาร", match: /^OH ?บริหาร/, base: "revenue", level: 1, kind: "cost" },
  { key: "net", label: "กำไรสุทธิ Net Profit", match: /^กำไรสุทธิ/, base: "revenue", level: 0, kind: "profit" },
];

export type Lines = Partial<Record<PnlKey, number>>;

export const revenueOf = (l: Lines) => (l.sale ?? 0) + (l.drive_price ?? 0) + (l.svc_price ?? 0);
export const baseOf = (l: Lines, b: Base) => (b === "revenue" ? revenueOf(l) : l[b] ?? 0);
/** % ของบรรทัดเทียบราคาของส่วนนั้น (null = ไม่มีราคา) */
export const pctOf = (l: Lines, d: LineDef) => {
  const b = baseOf(l, d.base);
  return b ? (l[d.key] ?? 0) / b : null;
};

/** รวมบรรทัด P&L ของหลายโครงการ */
export function sumLines(list: Lines[]): Lines {
  const out: Lines = {};
  for (const l of list) for (const d of PNL_LINES) if (l[d.key] != null) out[d.key] = (out[d.key] ?? 0) + (l[d.key] ?? 0);
  return out;
}

/** ปีของโครงการจากรหัส: A69-A123 → "69" */
export const yearOf = (code: string | null) => code?.match(/^[A-Z](\d{2})-/)?.[1] ?? "";

/** % เฉลี่ยต่อโครงการ (ค่าเฉลี่ยธรรมดาของ % แต่ละโครงการ แบบคอลัมน์ "ค่าเฉลี่ย" ในไฟล์) — ข้ามโครงการที่ไม่มีส่วนนั้น (ราคา = 0) */
export function avgPct(list: Lines[]): Partial<Record<PnlKey, number>> {
  const out: Partial<Record<PnlKey, number>> = {};
  for (const d of PNL_LINES) {
    const v = list.map((l) => pctOf(l, d)).filter((x): x is number => x != null);
    if (v.length) out[d.key] = v.reduce((s, x) => s + x, 0) / v.length;
  }
  return out;
}
