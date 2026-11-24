import "server-only";
import ExcelJS from "exceljs";
import type { ProjectRow, ProjectStatus } from "@/lib/data";
import { dow, fDate } from "@/lib/format";

/*
 * Export Master Planning แบบมีสี (ผู้ใช้เลือกแบบ B 24 พ.ย. 2569)
 * แท็บ "สถานะโครงการ" (เปิดก่อน): สรุปตามสถานะ + รายการทุกโครงการรวมแล้วเสร็จ/ยกเลิก
 * แท็บ "Pile": รูปแบบเดิม (คอลัมน์ A–Q + Plan/Actual รายวัน) เฉพาะ Ongoing / On Hand / Hold
 */
export const STATUS_X: Record<ProjectStatus, string> = { ongoing: "1-Ongoing", on_hand: "2-On Hand", hold: "3-Hold", completed: "5-Completed", cancelled: "6-ยกเลิก" };
const STATUS: Record<ProjectStatus, { th: string; fill: string; soft: string; font: string }> = {
  ongoing: { th: "กำลังตอก", fill: "2563EB", soft: "DBEAFE", font: "1E3A8A" },
  on_hand: { th: "รอเริ่มงาน", fill: "D97706", soft: "FEF3C7", font: "78350F" },
  hold: { th: "ชะลอโครงการ", fill: "6B7280", soft: "E5E7EB", font: "1F2937" },
  completed: { th: "แล้วเสร็จ", fill: "16A34A", soft: "DCFCE7", font: "14532D" },
  cancelled: { th: "ยกเลิก", fill: "DC2626", soft: "FEE2E2", font: "7F1D1D" },
};
const ORDER: ProjectStatus[] = ["ongoing", "on_hand", "hold", "completed", "cancelled"];
const ACTIVE: ProjectStatus[] = ["ongoing", "on_hand", "hold"];

const FONT = "Tahoma";
const DATE_FMT = "[$-th-TH,107]d mmm yy"; // พ.ศ. เดือนไทย
const NUM = "#,##0", NUM0 = '#,##0;[Red]-#,##0;"-"', MONEY = "#,##0.00", PCT = "0%";
const fill = (c: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + c } });
const thin = (c = "D5DBE6"): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb: "FF" + c } });
const box = (c?: string): Partial<ExcelJS.Borders> => ({ top: thin(c), left: thin(c), bottom: thin(c), right: thin(c) });
const font = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, ...o });
const toDate = (s: string | null) => (s ? new Date(s + "T00:00:00Z") : null);
const abColor = (n: number) => ({ argb: n >= 0 ? "FF15803D" : "FFC2410C" });

function headStyle(cell: ExcelJS.Cell, bg = "1E3A8A") {
  cell.fill = fill(bg);
  cell.font = font({ bold: true, color: { argb: "FFFFFFFF" } });
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = box("94A3B8");
}

export type PileData = {
  asof: string;
  days: string[];
  plan: Map<string, number>; // `${code}|${date}`
  actual: Map<string, number>;
  notes: Map<string, string>;
};

export async function buildMasterPlanningXlsx(all: ProjectRow[], d: PileData, money: boolean): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Master Planning";
  statusSheet(wb, all, d.asof, money);
  pileSheet(wb, all.filter((p) => ACTIVE.includes(p.status)), d, money);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- แท็บ สถานะโครงการ ----------
const STATUS_COLS: [string, number][] = [
  ["รหัสโครงการ", 11], ["ชื่อลูกค้า", 34], ["โครงการ", 40], ["PM", 9], ["Sales", 9], ["สถานะ", 13], ["สั่งซื้อ (ต้น)", 10], ["มูลค่าโครงการ (บาท)", 15],
  ["ตอกแล้ว (ต้น)", 10], ["คงเหลือ (ต้น)", 10], ["ความคืบหน้า", 11], ["Ahead / Behind", 10], ["กำหนดเริ่มงาน", 12], ["กำหนดแล้วเสร็จ", 12],
];

function statusSheet(wb: ExcelJS.Workbook, rows: ProjectRow[], asof: string, money: boolean) {
  const ws = wb.addWorksheet("สถานะโครงการ", { views: [{ state: "frozen", ySplit: 10, showGridLines: false }] });
  ws.mergeCells("A1:N1");
  const t = ws.getCell("A1");
  t.value = `สถานะโครงการ ณ วันที่ ${fDate(asof)}  (ผลงานตอกถึง ${fDate(asof)})`;
  t.font = font({ size: 16, bold: true, color: { argb: "FF1E3A8A" } });
  ws.getRow(1).height = 28;

  // สรุปตามสถานะ
  const sh = ws.getRow(3);
  ["สถานะ", "", "โครงการ", "สั่งซื้อ (ต้น)", "ตอกแล้ว (ต้น)", "คงเหลือ (ต้น)", ...(money ? ["มูลค่าโครงการ (บาท)", "มูลค่าคงเหลือ (บาท)"] : [])].forEach((h, i) => (sh.getCell(i + 1).value = h));
  ws.mergeCells("A3:B3");
  sh.height = 22;
  const sumCols = money ? 8 : 6;
  for (let c = 1; c <= sumCols; c++) headStyle(sh.getCell(c), "334155");
  const totals = (n: ProjectRow[]) => [n.length, n.reduce((s, x) => s + x.order_qty, 0), n.reduce((s, x) => s + x.done_qty, 0), n.reduce((s, x) => s + x.remain_qty, 0),
    ...(money ? [n.reduce((s, x) => s + x.contract_value, 0), n.reduce((s, x) => s + x.value_remain, 0)] : [])];
  ORDER.forEach((k, i) => {
    const st = STATUS[k], r = ws.getRow(4 + i);
    r.values = [`${STATUS_X[k]}  ${st.th}`, "", ...totals(rows.filter((x) => x.status === k))];
    ws.mergeCells(4 + i, 1, 4 + i, 2);
    r.height = 20;
    for (let c = 1; c <= sumCols; c++) {
      const cell = r.getCell(c);
      cell.border = box(); cell.font = font(); cell.fill = fill(st.soft);
      cell.alignment = { vertical: "middle", horizontal: c > 2 ? "right" : "left" };
      cell.numFmt = c >= 7 ? MONEY : NUM0;
    }
    r.getCell(1).fill = fill(st.fill);
    r.getCell(1).font = font({ bold: true, color: { argb: "FFFFFFFF" } });
  });
  const tr = ws.getRow(9);
  tr.values = ["รวมทั้งหมด", "", ...totals(rows)];
  ws.mergeCells("A9:B9");
  for (let c = 1; c <= sumCols; c++) {
    const cell = tr.getCell(c);
    cell.font = font({ bold: true }); cell.numFmt = c >= 7 ? MONEY : NUM0;
    cell.border = { top: { style: "medium" }, bottom: { style: "double" } };
    cell.alignment = { horizontal: c > 2 ? "right" : "left" };
  }

  // รายการโครงการ
  const hr = ws.getRow(10);
  STATUS_COLS.forEach(([h, w], i) => { hr.getCell(i + 1).value = h; ws.getColumn(i + 1).width = w; });
  hr.height = 30;
  hr.eachCell((c) => headStyle(c));
  if (!money) ws.getColumn(8).hidden = true;

  const byEnd = (a: ProjectRow, b: ProjectRow) => (a.end_date ?? "9").localeCompare(b.end_date ?? "9") || a.code.localeCompare(b.code);
  const list = [...rows].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)
    || (a.status === "completed" || a.status === "cancelled" ? (b.end_date ?? "").localeCompare(a.end_date ?? "") || a.code.localeCompare(b.code) : byEnd(a, b)));
  for (const p of list) {
    const st = STATUS[p.status];
    const closed = p.status === "completed" || p.status === "cancelled";
    const r = ws.addRow([p.code, p.customer_name, p.project_name, p.pm, p.sales, STATUS_X[p.status], p.order_qty, money ? p.contract_value || null : null,
      p.done_qty, p.remain_qty, p.order_qty ? p.done_qty / p.order_qty : 0,
      closed || !p.has_plan ? (p.status === "completed" ? "จบงาน" : closed ? "-" : "ไม่มีแผน") : Math.round(p.ahead_behind),
      toDate(p.start_date), toDate(p.end_date)]);
    r.height = 18;
    r.eachCell({ includeEmpty: true }, (c, i) => { c.font = font(); c.border = box(); c.alignment = { vertical: "middle", horizontal: i >= 6 ? "center" : "left" }; });
    r.getCell(1).font = font({ bold: true, color: { argb: "FF1D4ED8" } });
    r.getCell(6).fill = fill(st.fill);
    r.getCell(6).font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    r.getCell(7).numFmt = NUM; r.getCell(8).numFmt = MONEY; r.getCell(9).numFmt = NUM; r.getCell(10).numFmt = NUM0; r.getCell(11).numFmt = PCT;
    r.getCell(10).font = font({ bold: true });
    r.getCell(12).numFmt = "+#,##0;-#,##0;0";
    r.getCell(12).font = typeof r.getCell(12).value === "number" ? font({ bold: true, color: abColor(p.ahead_behind) }) : font({ size: 9, color: { argb: "FF9CA3AF" } });
    r.getCell(13).numFmt = DATE_FMT; r.getCell(14).numFmt = DATE_FMT;
  }
  const last = list.length + 10;
  if (list.length) {
    ws.addConditionalFormatting({ ref: `K11:K${last}`, rules: [{ type: "dataBar", priority: 1, minLength: 0, maxLength: 100, gradient: false,
      cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: "FF60A5FA" } } as ExcelJS.DataBarRuleType] });
    // ช้ากว่าแผนเกิน 20 ต้น = ไฮไลต์แดง
    ws.addConditionalFormatting({ ref: `L11:L${last}`, rules: [{ type: "cellIs", priority: 2, operator: "lessThan", formulae: ["-20"],
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEE2E2" } } } }] });
  }
  ws.autoFilter = { from: { row: 10, column: 1 }, to: { row: 10, column: 14 } };
}

// ---------- แท็บ Pile ----------
function pileSheet(wb: ExcelJS.Workbook, list: ProjectRow[], d: PileData, money: boolean) {
  const { days, asof } = d;
  const ws = wb.addWorksheet("Pile", { views: [{ state: "frozen", xSplit: 17, ySplit: 1, zoomScale: 85 }] });
  const hr = ws.addRow(["รหัสโครงการ", "PM รับผิดชอบ", "Sales รับผิดชอบ", "สถานะ", "ชื่อลูกค้า", "โครงการ", "สั่งซื้อ", "มูลค่าโครงการ", "มูลค่าเฉลี่ย/ต้น", "ตอกแล้ว",
    "คงเหลือตอก", "Remaining", "คิดเลขรวม", "Ahead or behind schedule", "กำหนดเริ่มงาน", "กำหนดแล้วเสร็จ", "วันที่", ...days.map(toDate)]);
  hr.height = 34;
  hr.eachCell((c, i) => {
    headStyle(c, i <= 17 ? "1E3A8A" : "334155");
    if (i > 17) {
      const day = days[i - 18];
      c.alignment = { textRotation: 90, horizontal: "center", vertical: "middle" };
      c.font = font({ size: 8, bold: true, color: { argb: "FFFFFFFF" } });
      c.numFmt = DATE_FMT; // วันที่จริง (serial) เหมือนไฟล์ต้นฉบับ → นำเข้ากลับได้
      if (dow(day) === 0) c.fill = fill("B91C1C");
      if (day === asof) c.fill = fill("F59E0B");
    }
  });
  [11, 9, 9, 11, 34, 38, 8, 13, 10, 8, 9, 9, 8, 10, 10, 10, 7].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let i = 0; i < days.length; i++) ws.getColumn(18 + i).width = 4.2;

  const sorted = [...list].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)
    || (a.start_date ?? "9").localeCompare(b.start_date ?? "9") || a.code.localeCompare(b.code));
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  sorted.forEach((p, idx) => {
    const st = STATUS[p.status];
    const plan = ws.addRow([p.code, p.pm, p.sales, STATUS_X[p.status], p.customer_name, p.project_name, p.order_qty, money ? p.contract_value || null : null,
      money ? p.value_per_pile || null : null, r3(p.done_qty), r3(p.remain_qty), p.order_qty ? p.remain_qty / p.order_qty : 0, p.order_qty, r3(p.ahead_behind),
      toDate(p.start_date), toDate(p.end_date), "Plan", ...days.map((x) => d.plan.get(`${p.code}|${x}`) ?? null)]);
    const act = ws.addRow([p.code, "", "", STATUS_X[p.status], p.billing_cycle, "", null, null, null, null, null, null, null, p.ahead_behind >= 0 ? "Ahead" : "Behind",
      toDate(p.start_date), p.end_note || null, "Actual", ...days.map((x) => d.actual.get(`${p.code}|${x}`) ?? d.notes.get(`${p.code}|${x}`) ?? null)]);
    const zebra = idx % 2 ? "F8FAFC" : "FFFFFF";
    for (const [row, isPlan] of [[plan, true], [act, false]] as const) {
      for (let c = 1; c <= 17 + days.length; c++) {
        const cell = row.getCell(c);
        cell.font = font({ size: c > 17 ? 8 : 9 });
        cell.border = { left: thin(), right: thin(), top: isPlan ? thin("94A3B8") : thin(), bottom: isPlan ? thin() : thin("94A3B8") };
        cell.alignment = { vertical: "middle", horizontal: c >= 7 ? "center" : "left" };
        if (c <= 17) cell.fill = fill(zebra);
      }
      row.getCell(4).fill = fill(st.soft);
      row.getCell(4).font = font({ size: 9, bold: true, color: { argb: "FF" + st.font } });
      row.getCell(14).font = font({ size: 9, bold: true, color: abColor(p.ahead_behind) });
      row.getCell(17).font = font({ size: 9, bold: true, color: { argb: isPlan ? "FF1D4ED8" : "FF15803D" } });
      row.getCell(15).numFmt = DATE_FMT; row.getCell(16).numFmt = DATE_FMT;
    }
    plan.getCell(1).font = font({ size: 9, bold: true, color: { argb: "FF1D4ED8" } });
    plan.getCell(7).numFmt = NUM; plan.getCell(8).numFmt = MONEY; plan.getCell(9).numFmt = MONEY; plan.getCell(10).numFmt = NUM;
    plan.getCell(11).numFmt = NUM; plan.getCell(11).font = font({ size: 9, bold: true }); plan.getCell(12).numFmt = PCT; plan.getCell(13).numFmt = NUM;
    plan.getCell(14).numFmt = "+#,##0;-#,##0;0";

    // ช่องรายวัน: แผน = ฟ้า, ตอกตามแผน = เขียว, ต่ำกว่าแผน = เหลือง, มีแผนแต่ไม่ได้ตอก = ชมพู, อาทิตย์ = แดงอ่อน
    days.forEach((x, i) => {
      const pc = plan.getCell(18 + i), ac = act.getCell(18 + i);
      const pv = d.plan.get(`${p.code}|${x}`) ?? 0, av = d.actual.get(`${p.code}|${x}`) ?? 0;
      if (dow(x) === 0) { pc.fill = fill("FDF2F2"); ac.fill = fill("FDF2F2"); }
      if (pv) { pc.fill = fill("DBEAFE"); pc.font = font({ size: 8, color: { argb: "FF1E3A8A" } }); }
      if (av) {
        const ok = av >= pv;
        ac.fill = fill(ok ? "DCFCE7" : "FEF3C7");
        ac.font = font({ size: 8, bold: true, color: { argb: ok ? "FF166534" : "FF92400E" } });
      } else if (pv && x <= asof) ac.fill = fill("FEE2E2");
      if (typeof ac.value === "string") ac.font = font({ size: 8, color: { argb: "FF9CA3AF" } });
      if (x === asof) {
        pc.border = { ...pc.border, right: { style: "medium", color: { argb: "FFF59E0B" } } };
        ac.border = { ...ac.border, right: { style: "medium", color: { argb: "FFF59E0B" } } };
      }
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 17 } };
}
