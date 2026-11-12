"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { avgPct, type Lines, PNL_LINES, pctOf, revenueOf, yearOf } from "@/lib/pnl";

type Avg = ReturnType<typeof avgPct>;

export type PnlRow = {
  sort: number; project_code: string | null; ref_text: string; customer: string; project: string; location: string; product: string;
  distance: number | null; piles: number | null; volume: number | null; trips: number | null; lines: Lines;
  contract_value?: number | null; // มูลค่าโครงการ (Master Planning, รวม VAT)
};

const M = (n: number | null | undefined) => (n == null ? "–" : (n / 1e6).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const B = (n: number | null | undefined) => (n == null ? "–" : Math.round(n).toLocaleString("th-TH"));
const P = (n: number | null | undefined) => (n == null ? "–" : `${(n * 100).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const ratio = (a: number | undefined, b: number | undefined) => (b ? (a ?? 0) / b : null);

type SortKey = "sort" | "piles" | "contract" | "prod" | "drive" | "gross" | "net" | "netPct";
const COLS: { key: SortKey; label: string }[] = [
  { key: "piles", label: "ต้น" },
  { key: "contract", label: "มูลค่าโครงการ ก่อน VAT (ล้าน)" },
  { key: "prod", label: "กำไรผลิต %" },
  { key: "drive", label: "กำไรตอก %" },
  { key: "gross", label: "กำไรขั้นต้น (ล้าน)" },
  { key: "net", label: "กำไรสุทธิ (ล้าน)" },
  { key: "netPct", label: "% สุทธิ" },
];

function metrics(r: PnlRow) {
  const l = r.lines;
  const revenue = revenueOf(l);
  return {
    sort: r.sort, piles: r.piles ?? 0, contract: r.contract_value == null ? null : r.contract_value / 1.07, revenue,
    prod: ratio(l.prod_profit, l.sale), drive: ratio(l.drive_profit, l.drive_price),
    gross: l.gross ?? 0, net: l.net ?? 0, netPct: ratio(l.net, revenue),
  };
}

export function ProjectTable({ rows, years }: { rows: PnlRow[]; years: string[] }) {
  const avg = useMemo(() => avgPct(rows.map((r) => r.lines)), [rows]);
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [only, setOnly] = useState<"" | "profit" | "loss">("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "sort", desc: false });
  const [open, setOpen] = useState<number | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = rows
      .map((r) => ({ r, m: metrics(r) }))
      .filter(({ r, m }) =>
        (!year || (yearOf(r.project_code) || "อื่นๆ") === year) &&
        (!only || (only === "loss" ? m.net < 0 : m.net >= 0)) &&
        (!s || `${r.ref_text} ${r.customer} ${r.project} ${r.location} ${r.product}`.toLowerCase().includes(s)));
    const k = sort.key;
    out.sort((a, b) => {
      const x = a.m[k] ?? -Infinity, y = b.m[k] ?? -Infinity;
      return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1);
    });
    return out;
  }, [rows, q, year, only, sort]);

  const maxAbs = Math.max(0.0001, ...list.map(({ m }) => Math.abs(m.netPct ?? 0)));
  const click = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "sort" }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.desc ? " ↓" : " ↑") : "");

  return (
    <>
      <div className="toolbar">
        <input className="pnl-search" placeholder="ค้นหา รหัส / ลูกค้า / โครงการ" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          <button type="button" className={!year ? "on" : ""} onClick={() => setYear("")}>ทุกปี</button>
          {years.map((y) => <button key={y} type="button" className={year === y ? "on" : ""} onClick={() => setYear(y)}>{/^\d+$/.test(y) ? `ปี ${y}` : y}</button>)}
        </div>
        <div className="seg">
          <button type="button" className={!only ? "on" : ""} onClick={() => setOnly("")}>ทั้งหมด</button>
          <button type="button" className={only === "profit" ? "on" : ""} onClick={() => setOnly("profit")}>กำไร</button>
          <button type="button" className={only === "loss" ? "on" : ""} onClick={() => setOnly("loss")}>ขาดทุน</button>
        </div>
        <div className="grow" />
        <span className="muted">{list.length} โครงการ · คลิกแถวเพื่อดูรายละเอียด</span>
      </div>
      <div className="tbl-wrap">
        <table className="pnl-tbl">
          <thead>
            <tr>
              <th className="sortable" onClick={() => click("sort")}>#{arrow("sort")}</th>
              <th>โครงการ</th>
              {COLS.map((c) => <th key={c.key} className="num sortable" onClick={() => click(c.key)}>{c.label}{arrow(c.key)}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map(({ r, m }) => (
              <Fragment key={r.sort}>
                <tr className={`row ${open === r.sort ? "open" : ""}`} onClick={() => setOpen(open === r.sort ? null : r.sort)}>
                  <td className="muted">{r.sort}</td>
                  <td className="pj">
                    <b>{r.ref_text || "ไม่มีรหัส"}</b> <span className="muted">{r.customer}</span>
                    <div className="sub">{r.project}{r.location ? ` · ${r.location}` : ""}</div>
                  </td>
                  <td className="num">{B(r.piles)}</td>
                  <td className="num">{M(m.contract)}</td>
                  <td className={`num ${m.prod != null && m.prod < 0 ? "neg" : ""}`}>{P(m.prod)}</td>
                  <td className={`num ${m.drive != null && m.drive < 0 ? "neg" : ""}`}>{P(m.drive)}</td>
                  <td className={`num ${m.gross < 0 ? "neg" : ""}`}>{M(m.gross)}</td>
                  <td className={`num b ${m.net < 0 ? "neg" : "pos"}`}>{M(m.net)}</td>
                  <td className="num">
                    <span className="pbar"><i className={m.net < 0 ? "neg" : ""} style={{ width: `${(Math.abs(m.netPct ?? 0) / maxAbs) * 100}%` }} /></span>
                    <span className={m.net < 0 ? "neg" : "pos"}>{P(m.netPct)}</span>
                  </td>
                </tr>
                {open === r.sort && (
                  <tr className="detail">
                    <td colSpan={COLS.length + 2}><Detail r={r} avg={avg} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="empty">ไม่พบโครงการ</div>}
      </div>
    </>
  );
}

function Detail({ r, avg }: { r: PnlRow; avg: Avg }) {
  const l = r.lines;
  return (
    <div className="pnl-detail">
      <div className="facts">
        {r.project_code && <Link href={`/projects/${r.project_code}`} className="chip">ดูแผน/ผลงานโครงการ →</Link>}
        {r.product && <span className="chip">สินค้า: {r.product}</span>}
        {r.distance != null && <span className="chip">ระยะทาง: {B(r.distance)} กม.</span>}
        {r.contract_value != null && <span className="chip">มูลค่าโครงการ ก่อน VAT: ฿{B(r.contract_value / 1.07)}</span>}
        <span className="chip">จำนวน: {B(r.piles)} ต้น</span>
        {r.volume != null && <span className="chip">ปริมาณ: {r.volume.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ลบ.ม.</span>}
        {r.volume ? <span className="chip">รายได้/ลบ.ม.: ฿{B(revenueOf(l) / r.volume)}</span> : null}
        {r.trips != null && r.trips > 0 && <span className="chip">ขนส่ง: {B(r.trips)} เที่ยว</span>}
      </div>
      <table className="pnl-stmt">
        <thead>
          <tr><th>รายการ</th><th className="num">บาท</th><th className="num">% ราคาขาย</th><th className="num">% เฉลี่ยทุกโครงการ</th><th className="num">เทียบเฉลี่ย</th></tr>
        </thead>
        <tbody>
          {PNL_LINES.filter((d) => l[d.key] != null).map((d) => {
            const v = l[d.key] ?? 0;
            const p = pctOf(l, d);
            const a = avg[d.key];
            const diff = d.kind !== "rev" && p != null && a != null ? p - a : null;
            // ต้นทุน: ต่ำกว่าเฉลี่ย = ดี · กำไร: สูงกว่าเฉลี่ย = ดี
            const good = diff == null ? null : d.kind === "cost" ? diff <= 0 : diff >= 0;
            return (
              <tr key={d.key} className={`lv${d.level} ${d.kind}`}>
                <td>{d.label}</td>
                <td className={`num ${d.kind === "profit" && v < 0 ? "neg" : ""}`}>{B(v)}</td>
                <td className="num">{P(p)}</td>
                <td className="num muted">{d.kind === "rev" ? "" : P(a)}</td>
                <td className="num">
                  {diff != null && Math.abs(diff) >= 0.0005 && (
                    <span className={`pnl-diff ${good ? "g" : "r"}`}>{diff > 0 ? "▲" : "▼"} {(Math.abs(diff) * 100).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                  )}
                  {diff != null && Math.abs(diff) < 0.0005 && <span className="muted">≈</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="sub" style={{ marginTop: 8 }}>
        เทียบเฉลี่ย = จุด % ต่างจากค่าเฉลี่ยของทุกโครงการ (เฉลี่ยแบบเดียวกับคอลัมน์ &quot;ค่าเฉลี่ย&quot; ในไฟล์) ·
        <span className="pnl-diff g">เขียว</span> = ดีกว่าเฉลี่ย (ต้นทุนต่ำกว่า / กำไรสูงกว่า) · <span className="pnl-diff r">ส้ม</span> = แย่กว่าเฉลี่ย
      </div>
    </div>
  );
}
