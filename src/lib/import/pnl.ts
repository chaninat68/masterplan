// ไฟล์ Profit and Loss.xlsx แท็บ TS: โครงการเรียงเป็นคอลัมน์ (บล็อกละ 2–3 คอลัมน์: [เที่ยว] / Actual / % ราคาขาย)
// แถวหัวบล็อก (เหนือแถว "Actual"): รายได้ต่อหน่วย, สินค้า|ระยะทาง, "รหัส - ลูกค้า", "โครงการ - สถานที่", รายได้รวม, จำนวนต้น, ปริมาณ
// แถว P&L: ชื่ออยู่คอลัมน์ป้ายกำกับ (หาจากคำว่า "ราคาขายเสาเข็ม") · คอลัมน์ A–B ด้านบน = อัตราที่ใช้คำนวณ
import type { WorkBook } from "xlsx";
import { type Cell, num, str } from "./excel";
import { PNL_LINES, type PnlKey } from "../pnl";

export type PnlParam = { name: string; value: number };
export type PnlProject = {
  sort: number;
  project_code: string;
  ref_text: string;
  customer: string;
  project: string;
  location: string;
  product: string;
  distance: number | null;
  revenue: number | null;
  piles: number | null;
  volume: number | null;
  trips: number | null;
  lines: Partial<Record<PnlKey, number>>;
};
export type PnlParsed = { sheet: string; params: PnlParam[]; projects: PnlProject[]; warnings: string[] };

const CODE = /^[A-Z]\d{2}-[A-Z]\d{3,4}/;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** "A69-A031,032 - บริษัท ..." → รหัส / ลูกค้า */
export function splitRef(s: string): { project_code: string; ref_text: string; customer: string } {
  const t = norm(s);
  const i = t.indexOf(" - ");
  const left = i >= 0 ? t.slice(0, i).trim() : t;
  const m = left.match(CODE);
  if (!m) return { project_code: "", ref_text: "", customer: t };
  return { project_code: m[0], ref_text: left, customer: i >= 0 ? t.slice(i + 3).trim() : "" };
}

/** "โครงการ - สถานที่" */
export function splitProject(s: string): { project: string; location: string } {
  const t = norm(s);
  const i = t.indexOf(" - ");
  return i >= 0 ? { project: t.slice(0, i).trim(), location: t.slice(i + 3).trim() } : { project: t, location: "" };
}

export function parsePnl(wb: WorkBook): PnlParsed {
  const warnings: string[] = [];
  // หาแท็บที่มีคำว่า "ราคาขายเสาเข็ม" (ปกติชื่อ TS)
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const dense = (ws as unknown as { "!data"?: { v?: Cell }[][] })["!data"];
    const at = (r: number, c: number): Cell => (dense ? dense[r]?.[c]?.v : undefined);
    const rows = dense?.length ?? 0;
    let labelCol = -1;
    let saleRow = -1;
    for (let r = 0; r < Math.min(rows, 80) && labelCol < 0; r++) {
      const row = dense?.[r] ?? [];
      for (let c = 0; c < Math.min(row.length, 30); c++) if (/^ราคาขายเสาเข็ม/.test(str(at(r, c)))) { labelCol = c; saleRow = r; break; }
    }
    if (labelCol < 0) continue;

    // แถวหัว "Actual" (เหนือแถวราคาขาย)
    let head = -1;
    for (let r = saleRow; r >= 0 && head < 0; r--) if ((dense?.[r] ?? []).some((x) => str(x?.v) === "Actual")) head = r;
    if (head < 7) throw new Error("ไม่พบแถวหัวตาราง \"Actual\" ในแท็บ " + name);

    // แถว P&L
    const lineRow = new Map<PnlKey, number>();
    for (let r = head + 1; r < rows; r++) {
      const label = norm(str(at(r, labelCol)));
      if (!label) continue;
      const def = PNL_LINES.find((d) => !lineRow.has(d.key) && d.match.test(label));
      if (def) lineRow.set(def.key, r);
    }
    for (const d of PNL_LINES) if (!lineRow.has(d.key)) warnings.push(`ไม่พบบรรทัด "${d.label}"`);

    // อัตราที่ใช้คำนวณ (คอลัมน์ซ้ายของป้ายกำกับ ด้านบน)
    const params: PnlParam[] = [];
    for (let r = 0; r <= head + 2; r++) {
      const n = norm(str(at(r, 0)));
      const v = num(at(r, 1));
      if (n && v != null) params.push({ name: n, value: v });
    }

    // บล็อกโครงการ: คอลัมน์ที่หัว = "Actual" — ข้อมูลหัวบล็อกอยู่ที่เซลล์ผสาน (เริ่มคอลัมน์ซ้ายสุดของบล็อก)
    const merges = ws["!merges"] ?? [];
    const headRow = dense?.[head] ?? [];
    const actualCols: number[] = [];
    headRow.forEach((x, c) => { if (c > labelCol && str(x?.v) === "Actual") actualCols.push(c); });
    const infoRow = head - 5; // "รหัส - ลูกค้า"
    const projects: PnlProject[] = [];
    actualCols.forEach((a, i) => {
      const m = merges.find((g) => g.s.r <= infoRow && g.e.r >= infoRow && g.s.c <= a && g.e.c >= a);
      const info = m ? m.s.c : a;
      const val = (r: number | undefined) => (r == null ? null : num(at(r, a)));
      const lines: Partial<Record<PnlKey, number>> = {};
      for (const [k, r] of lineRow) {
        const v = val(r);
        if (v != null) lines[k] = v;
      }
      if (!Object.keys(lines).length) return;
      const ref = splitRef(str(at(infoRow, info)));
      const pj = splitProject(str(at(head - 4, info)));
      const r3 = at(head - 6, info);
      const tr = lineRow.get("transport");
      const trips = info < a && tr != null ? num(at(tr, a - 1)) : null;
      const revenue = num(at(head - 3, info)) ?? (lines.sale ?? 0) + (lines.drive_price ?? 0) + (lines.svc_price ?? 0);
      if (!ref.project_code) warnings.push(`โครงการลำดับ ${i + 1} ไม่มีรหัสโครงการ: ${ref.customer || "(ว่าง)"}`);
      projects.push({
        sort: projects.length + 1,
        ...ref,
        ...pj,
        product: typeof r3 === "string" ? norm(r3) : "",
        distance: typeof r3 === "number" ? r3 : null,
        revenue,
        piles: num(at(head - 2, info)),
        volume: num(at(head - 1, info)),
        trips,
        lines,
      });
    });
    if (!projects.length) throw new Error("ไม่พบข้อมูลโครงการในแท็บ " + name);
    return { sheet: name, params, projects, warnings };
  }
  throw new Error("ไม่พบตาราง Profit and Loss (ต้องมีบรรทัด \"ราคาขายเสาเข็ม\")");
}
