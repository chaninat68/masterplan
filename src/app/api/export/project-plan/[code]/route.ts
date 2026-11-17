import * as XLSX from "xlsx";
import { createClient, fetchAll } from "@/lib/supabase/server";
import { resolveAsof } from "@/lib/data";
import { addDays, dayRange, dow, TH_DAYS } from "@/lib/format";
import { canExport, forbidden } from "@/lib/xlsxResponse";

// ไฟล์แผนงานรายโครงการ — รูปแบบเดียวกับที่ปุ่ม "อัปโหลดไฟล์แผนงาน" อ่านได้ (src/lib/import/projectPlan.ts):
// แถว "วันที่" = วันที่เป็นคอลัมน์, แถว "แผนงาน" = ต้น/วัน · แถว ผลงาน/ผลงานสะสม ไว้ดูประกอบ (ตอนอัปโหลดถูกข้าม)

const serial = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  if (!(await canExport("projects"))) return forbidden();
  const code = decodeURIComponent((await ctx.params).code).toUpperCase();
  if (!/^[A-Z]\d{2}-[A-Z]\d{3,4}$/.test(code)) return new Response("รหัสโครงการไม่ถูกต้อง", { status: 400 });

  const supabase = await createClient();
  const { asof } = await resolveAsof(supabase, null);
  const [proj, plans, actuals] = await Promise.all([
    supabase.from("projects").select("code, project_name, customer_name, status, order_qty").eq("code", code).maybeSingle(),
    fetchAll<{ plan_date: string; planned_qty: number }>((a, b) => supabase.from("project_plan_days").select("plan_date, planned_qty").eq("project_code", code).order("plan_date").range(a, b)),
    fetchAll<{ work_date: string; qty: number }>((a, b) => supabase.from("v_project_actual_days").select("work_date, qty").eq("project_code", code).lte("work_date", asof).order("work_date").range(a, b)),
  ]);
  if (!proj.data) return new Response("ไม่พบโครงการ", { status: 404 });
  const p = proj.data;

  const plan = new Map(plans.map((x) => [x.plan_date, Number(x.planned_qty)]));
  const actual = new Map(actuals.map((x) => [x.work_date, Number(x.qty)]));
  const keys = [...plan.keys(), ...actual.keys()].sort();
  const finished = p.status === "completed" || p.status === "cancelled";
  const last = keys[keys.length - 1] ?? asof;
  // เหมือนตารางในหน้าโครงการ: โครงการที่ยังไม่จบ ต่อไปอีก 30 วันจากวันข้อมูลล่าสุด เพื่อใส่แผนล่วงหน้าได้
  const end = !finished && addDays(asof, 30) > last ? addDays(asof, 30) : last;
  const days = dayRange(keys[0] ?? asof, end);

  let run = 0;
  const cum = days.map((d) => (d > asof ? null : (run += actual.get(d) ?? 0)));
  const n = days.length;
  const col = (i: number) => XLSX.utils.encode_col(i);
  const lastCol = col(n); // คอลัมน์ข้อมูลสุดท้าย (B.. = วันที่)
  const R = 5; // แถวหัววันที่ (1-based)

  const aoa: (string | number | null)[][] = [
    ["แผนงานโครงการ", `${p.code} ${p.project_name ?? ""}`.trim()],
    ["ลูกค้า", p.customer_name ?? "", ...Array(2).fill(null), "ยอดสั่งซื้อ (ต้น)", Number(p.order_qty)],
    ["วิธีใช้: แก้ตัวเลขในแถว \"แผนงาน\" (ช่องว่าง = ไม่มีแผน) แล้วอัปโหลดกลับที่หน้าโครงการ ปุ่ม \"อัปโหลดไฟล์แผนงาน\" — แผนตั้งแต่วันแรกในไฟล์จะถูกแทนที่ทั้งหมด"],
    [],
    ["วันที่", ...days.map(serial), "รวม"],
    ["วัน", ...days.map((d) => TH_DAYS[dow(d)]), null],
    ["แผนงาน", ...days.map((d) => plan.get(d) ?? null), null],
    ["ผลงาน (ตอกจริง)", ...days.map((d) => (d > asof ? null : actual.get(d) ?? null)), null],
    ["ผลงานสะสม", ...cum, null],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let i = 1; i <= n; i++) {
    const c = ws[`${col(i)}${R}`];
    if (c) c.z = "d/m/yy";
  }
  // รวม = สูตร (แก้แผนใน Excel แล้วยอดรวมเปลี่ยนตาม)
  const totCol = col(n + 1);
  ws[`${totCol}7`] = { t: "n", v: plans.reduce((s, x) => s + Number(x.planned_qty), 0), f: `SUM(B7:${lastCol}7)` };
  ws[`${totCol}8`] = { t: "n", v: [...actual].filter(([d]) => d <= asof).reduce((s, [, q]) => s + q, 0), f: `SUM(B8:${lastCol}8)` };
  ws["!cols"] = [{ wch: 16 }, ...Array(n).fill({ wch: 6 }), { wch: 9 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plan");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plan.xlsx"; filename*=UTF-8''${encodeURIComponent(`แผนงาน ${code} ${asof}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
