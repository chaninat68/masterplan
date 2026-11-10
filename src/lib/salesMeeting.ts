// สูตรรายงานประชุมแผนกขาย (เหมือนแท็บ สรุปยอด ในไฟล์ Sales Update)
// * ยอดขายเดือนนี้ = Σ ยอดขายรายสัปดาห์
// * ประมาณการเดือนนี้ Base = ยอดขายเดือนนี้ + Σ งาน Base ที่คาดว่าจะได้เดือนนี้ (+ ส่วนที่พิมพ์เพิ่มในช่องประมาณการสัปดาห์) · Best = Base + Σ งาน Best เดือนนี้
// * ประมาณการสัปดาห์ถัดไป (เช่น "ประมาณการ สัปดาห์ที่ 2") = Σ งาน Base เดือนนี้ที่ระบุสัปดาห์/วัน ("พ.ย. Week 2", "30 ต.ค.") + next_adj
// * เดือนถัดไป Base = Σ งาน Base เดือนนั้น · Best = Base + Σ งาน Best เดือนนั้น
// ไม่นับ "ไม่ได้งาน" / "ไม่บวกเข้ายอด" / "ยกเลิก"

export type PipelineLite = { salesperson: string; product: string; value: number; category: string; expected_month: string | null; expected_text?: string };
export type Forecast = { month: string; base: number; best: number };

export function addMonths(month: string, n: number): string {
  const d = new Date(month.slice(0, 7) + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** ประมาณการ 3 เดือน (เดือนที่ประชุม + 2 เดือนถัดไป) ของกลุ่มรายการ pipeline */
/** งาน Base เดือนนี้ที่ระบุสัปดาห์หรือวัน = ประมาณการสัปดาห์ถัดไป */
export const isNearTerm = (x: PipelineLite, period: string) =>
  x.category === "base" && x.expected_month === period && /^\s*\d{1,2}\s*[฀-๿]|week\s*\d/i.test(x.expected_text ?? "");

export function nearTerm(items: PipelineLite[], period: string, adj = 0): number {
  return adj + items.filter((x) => isNearTerm(x, period)).reduce((s, x) => s + Number(x.value), 0);
}

/** adj = ส่วนที่พิมพ์เพิ่มในช่องประมาณการสัปดาห์ (ไม่มีรายการงานรองรับ) บวกเข้า Base เดือนนี้ */
export function forecast(items: PipelineLite[], period: string, actualThisMonth: number, months = 3, adj = 0): Forecast[] {
  return Array.from({ length: months }, (_, k) => {
    const m = addMonths(period, k);
    const sum = (cat: string) => items.filter((x) => x.category === cat && x.expected_month === m).reduce((s, x) => s + Number(x.value), 0);
    const base = (k === 0 ? actualThisMonth + adj : 0) + sum("base");
    return { month: m, base, best: base + sum("best") };
  });
}

export const CATEGORY_LABEL: Record<string, string> = {
  base: "Base", best: "Best", lost: "ไม่ได้งาน", excluded: "ไม่บวกเข้ายอด", cancelled: "ยกเลิก", "": "ไม่ระบุ",
};

/** ล้านบาท 2 ตำแหน่ง (รูปแบบเดียวกับไฟล์ประชุม) */
export const fM = (n: number | null | undefined) => (n == null ? "–" : (n / 1e6).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
