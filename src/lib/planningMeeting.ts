// ประชุมประจำเดือนส่วนงานวางแผน (Project Planning) — โครงสร้างข้อมูลตามไฟล์นำเสนอ "Planning Presentation"
// 01 สถานะโครงการ (จำนวน / มูลค่า × พร้อมตอก/ส่งอย่างเดียว/รับเอง, ปีนี้เทียบปีก่อน) + โครงการมีปัญหา
// 02 Project Timeline (จากแผนรายวันในระบบ) · 03 แผนการจัดส่ง (ประเภทก่อสร้าง / 5 ผลิตภัณฑ์)
import { z } from "zod";

export const STATUS_COLS = [
  { key: "completed", label: "ดำเนินการแล้วเสร็จ", short: "Completed", color: "var(--s3)" },
  { key: "ongoing", label: "อยู่ระหว่างการดำเนินการ", short: "Ongoing", color: "var(--s1)" },
  { key: "on_hand", label: "เปิด SO แล้วและรอเริ่มดำเนินการ", short: "On Hand", color: "var(--accent-2)" },
  { key: "potential", label: "อยู่ระหว่างการตัดสินใจของลูกค้า", short: "Potential", color: "var(--s4)" },
  { key: "hold", label: "เปิด SO / ดำเนินการแล้วแต่มีปัญหา", short: "Hold", color: "var(--bad)" },
] as const;
export const SERVICE_ROWS = [
  { key: "ready", label: "พร้อมตอก" },
  { key: "ship", label: "ส่งอย่างเดียว" },
  { key: "self", label: "รับเอง" },
] as const;
export type ServiceKey = (typeof SERVICE_ROWS)[number]["key"];

const Num = z.number().finite().min(-1e9).max(1e9).nullable();
const Row = z.array(Num).length(5);
const Grid = z.object({ ready: Row, ship: Row, self: Row });
export const StatusSchema = z.object({ cur: Grid, prev: Grid });
export type StatusGrid = z.infer<typeof Grid>;
export type StatusData = z.infer<typeof StatusSchema>;

const Text = (max = 300) => z.string().trim().max(max);
export const IssueSchema = z.object({
  code: Text(30), customer: Text(), project: Text(), issue: Text(500), detail: Text(1000),
  value: Num, outstanding: Text(100), remain_qty: Num, timeline: Text(100),
});
export const IssuesSchema = z.array(IssueSchema).max(100);
export type Issue = z.infer<typeof IssueSchema>;

export const DeliverySchema = z.object({
  rate: Num,
  by_type: z.array(z.object({ type: Text(60), m3: Num, piles: Num })).max(20),
  products: z.array(z.object({ product: Text(60), m3: Num, piles: Num, projects: Text(500) })).max(20),
});
export type Delivery = z.infer<typeof DeliverySchema>;

export const PROJECT_TYPES = ["Industrial", "Commercial", "Residential", "Infrastructure", "Other"];

const emptyGrid = (): StatusGrid => ({ ready: Array(5).fill(null), ship: Array(5).fill(null), self: Array(5).fill(null) });

/** อ่าน jsonb จากฐานข้อมูลแบบทนทาน (ข้อมูลว่าง/ไม่ครบ = เติมค่าว่าง) */
export function normStatus(raw: unknown): StatusData {
  const r = StatusSchema.safeParse(raw);
  if (r.success) return r.data;
  const g = (x: unknown): StatusGrid => {
    const e = emptyGrid();
    if (x && typeof x === "object")
      for (const k of ["ready", "ship", "self"] as const) {
        const a = (x as Record<string, unknown>)[k];
        if (Array.isArray(a)) e[k] = e[k].map((_, i) => (typeof a[i] === "number" ? (a[i] as number) : null));
      }
    return e;
  };
  const o = (raw ?? {}) as Record<string, unknown>;
  return { cur: g(o.cur), prev: g(o.prev) };
}
export const normIssues = (raw: unknown): Issue[] => { const r = IssuesSchema.safeParse(raw); return r.success ? r.data : []; };
export function normDelivery(raw: unknown): Delivery {
  const r = DeliverySchema.safeParse(raw);
  return r.success ? r.data : { rate: null, by_type: PROJECT_TYPES.map((type) => ({ type, m3: null, piles: null })), products: [] };
}

const v = (x: number | null) => x ?? 0;
/** รวมตามคอลัมน์สถานะ (3 แถวบริการ) */
export const colTotals = (g: StatusGrid) => [0, 1, 2, 3, 4].map((i) => v(g.ready[i]) + v(g.ship[i]) + v(g.self[i]));
export const rowTotal = (r: (number | null)[]) => r.reduce<number>((s, x) => s + v(x), 0);
