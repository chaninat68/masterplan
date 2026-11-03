// นำเข้าตาราง "สถานะโครงการ" สำหรับประชุมประจำเดือน (ไฟล์ ทำข้อมูลสถานะโครงการ.xlsx)
// รูปแบบ: แถวหัว "หน่วย: จำนวนโครงการ" / "หน่วย: จำนวนมูลค่า" + คอลัมน์ Completed/Ongoing/On Hand/Potential/Hold
// ใต้หัว = บล็อกต่อปี (คอลัมน์ A เช่น "ตุลาคม 2569") แถว พร้อมตอก / ส่งอย่างเดียว / รับเอง (แถวรวม/% ข้าม — ระบบคำนวณเอง)
import type * as XLSX from "xlsx";
import { num, sheetRows, str, type Cell } from "./excel";
import type { ServiceKey, StatusData, StatusGrid } from "../planningMeeting";

const COLS = ["completed", "ongoing", "on hand", "potential", "hold"];
const SERVICES: Record<string, ServiceKey> = { "พร้อมตอก": "ready", "ส่งอย่างเดียว": "ship", "รับเอง": "self" };

type Block = { label: string; year: number; grid: StatusGrid };
export type StatusImport = { counts: StatusData; values: StatusData; labels: { cur: string; prev: string }; sheet: string };

const empty = (): StatusGrid => ({ ready: Array(5).fill(null), ship: Array(5).fill(null), self: Array(5).fill(null) });
const yearOf = (s: string) => Number(s.match(/(25\d{2}|20\d{2})/)?.[1] ?? 0);

function parseSheet(rows: Cell[][]) {
  const out: { count: Block[]; value: Block[] } = { count: [], value: [] };
  let kind: "count" | "value" | null = null;
  let colIdx: number[] = [];
  let block: Block | null = null;
  for (const row of rows) {
    const cells = (row ?? []).map(str);
    const lower = cells.map((c) => c.toLowerCase());
    // แถวหัวตาราง
    const idx = COLS.map((c) => lower.findIndex((x) => x === c));
    if (idx.every((i) => i >= 0)) {
      const unit = cells.find((c) => c.includes("หน่วย")) ?? "";
      kind = unit.includes("มูลค่า") ? "value" : "count";
      colIdx = idx;
      block = null;
      continue;
    }
    if (!kind) continue;
    // ป้ายปี (คอลัมน์แรกที่มีปี เช่น "ตุลาคม 2569")
    const yr = cells.find((c, i) => i < 2 && yearOf(c) > 0);
    if (yr) {
      block = { label: yr.replace(/\s+/g, " ").trim(), year: yearOf(yr), grid: empty() };
      out[kind].push(block);
    }
    const svc = cells.map((c) => SERVICES[c]).find(Boolean);
    if (block && svc) {
      const factor = kind === "value" ? 1e6 : 1;
      block.grid[svc] = colIdx.map((i) => {
        const v = num(row[i]);
        return v == null || v === 0 ? null : Math.round((v / factor) * 1e4) / 1e4;
      });
    }
  }
  return out;
}

/** อ่านทุกแท็บ ใช้แท็บแรกที่มีทั้งตารางจำนวนและมูลค่า ปีละ 2 บล็อก (ปีมาก = ปีนี้) */
export function parsePlanningStatus(wb: XLSX.WorkBook): StatusImport {
  for (const name of wb.SheetNames) {
    const r = parseSheet(sheetRows(wb, name));
    if (r.count.length < 1 || r.value.length < 1) continue;
    const pick = (bs: Block[]) => {
      const s = [...bs].sort((a, b) => b.year - a.year);
      return { cur: s[0], prev: s[1] };
    };
    const c = pick(r.count), v = pick(r.value);
    const toData = (x: { cur: Block; prev?: Block }): StatusData => ({ cur: x.cur.grid, prev: x.prev?.grid ?? empty() });
    return { counts: toData(c), values: toData(v), labels: { cur: c.cur.label, prev: c.prev?.label ?? "" }, sheet: name };
  }
  throw new Error("ไม่พบตารางสถานะโครงการ — ต้องมีหัวคอลัมน์ Completed / Ongoing / On Hand / Potential / Hold และแถว พร้อมตอก / ส่งอย่างเดียว / รับเอง ทั้งตาราง 'จำนวนโครงการ' และ 'มูลค่า'");
}
