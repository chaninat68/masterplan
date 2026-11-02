// สูตรรายงานประชุมแผนกขาย (เหมือนแท็บ สรุปยอด ในไฟล์ Sales Update)
// * ยอดขายเดือนนี้ = Σ ยอดขายรายสัปดาห์
// * ประมาณการเดือนนี้ Base = ยอดขายเดือนนี้ + Σ งาน Base ที่คาดว่าจะได้เดือนนี้ · Best = Base + Σ งาน Best เดือนนี้
// * เดือนถัดไป Base = Σ งาน Base เดือนนั้น · Best = Base + Σ งาน Best เดือนนั้น
// ไม่นับ "ไม่ได้งาน" / "ไม่บวกเข้ายอด" / "ยกเลิก"

export type PipelineLite = { salesperson: string; product: string; value: number; category: string; expected_month: string | null };
export type Forecast = { month: string; base: number; best: number };

export function addMonths(month: string, n: number): string {
  const d = new Date(month.slice(0, 7) + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** ประมาณการ 3 เดือน (เดือนที่ประชุม + 2 เดือนถัดไป) ของกลุ่มรายการ pipeline */
export function forecast(items: PipelineLite[], period: string, actualThisMonth: number, months = 3): Forecast[] {
  return Array.from({ length: months }, (_, k) => {
    const m = addMonths(period, k);
    const sum = (cat: string) => items.filter((x) => x.category === cat && x.expected_month === m).reduce((s, x) => s + Number(x.value), 0);
    const base = (k === 0 ? actualThisMonth : 0) + sum("base");
    return { month: m, base, best: base + sum("best") };
  });
}

export const CATEGORY_LABEL: Record<string, string> = {
  base: "Base", best: "Best", lost: "ไม่ได้งาน", excluded: "ไม่บวกเข้ายอด", cancelled: "ยกเลิก", "": "ไม่ระบุ",
};

/** ล้านบาท 2 ตำแหน่ง (รูปแบบเดียวกับไฟล์ประชุม) */
export const fM = (n: number | null | undefined) => (n == null ? "–" : (n / 1e6).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
