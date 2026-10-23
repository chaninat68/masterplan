import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAsof, getProjects, type ProjectStatus } from "@/lib/data";
import { fDate, fNum, STATUS_LABEL } from "@/lib/format";
import { AheadChip, Empty, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "แผน / ผลงาน" };

const TABS: (ProjectStatus | "all")[] = ["ongoing", "on_hand", "hold", "completed", "cancelled", "all"];

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const user = await requirePage("projects");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const tab = (typeof sp.tab === "string" && TABS.includes(sp.tab as ProjectStatus) ? sp.tab : "ongoing") as ProjectStatus | "all";
  const supabase = await createClient();
  const [asof, all] = await Promise.all([getAsof(supabase), getProjects(supabase)]);

  let rows = q
    ? all.filter((p) => `${p.code} ${p.project_name} ${p.customer_name} ${p.pm} ${p.sales}`.toLowerCase().includes(q.toLowerCase()))
    : all.filter((p) => tab === "all" || p.status === tab);
  rows = rows.sort((a, b) =>
    a.status === "ongoing" && b.status === "ongoing" ? a.ahead_behind - b.ahead_behind : (b.start_date ?? "").localeCompare(a.start_date ?? ""));
  const shown = rows.slice(0, 200);
  const count = (s: ProjectStatus | "all") => (s === "all" ? all.length : all.filter((p) => p.status === s).length);

  return (
    <>
      <PageHeader title="แผน / ผลงานรายโครงการ" sub="คลิกโครงการเพื่อดูแผนเทียบผลงานรายวัน — ตอกด้วยปั้นจั่นไหน ขนาดอะไร ยาวเท่าไร กะไหน" asof={asof} readOnly={!user.canEdit} />
      <div className="card">
        <div className="toolbar">
          <div className="seg">
            {TABS.map((t) => (
              <Link key={t} href={`/projects?tab=${t}`} className={!q && tab === t ? "on" : ""}>
                {t === "all" ? "ทั้งหมด" : STATUS_LABEL[t]}<span className="n">{count(t)}</span>
              </Link>
            ))}
          </div>
          <div className="grow" />
          <form action="/projects" style={{ display: "flex", gap: 8 }}>
            <input className="input" name="q" defaultValue={q} placeholder="ค้นหาในตาราง…" style={{ width: 220 }} />
          </form>
          <a className="btn ghost sm" href="/api/export/master-planning"><Icon name="dl" />Export Master Planning</a>
        </div>
        {q && <div className="sub" style={{ marginBottom: 8 }}>ผลการค้นหา &quot;{q}&quot; {rows.length} โครงการ · <Link href="/projects" className="link">ล้าง</Link></div>}
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>โครงการ / ลูกค้า</th><th>สถานะ</th><th className="num">ตอกแล้ว / สั่งซื้อ</th><th style={{ minWidth: 170 }}>ความคืบหน้า</th><th>เทียบแผน</th><th className="num">อัตรา/วัน</th><th>คาดเสร็จ</th></tr></thead>
            <tbody>
              {shown.map((p) => {
                const late = p.eta && p.end_date && p.eta > p.end_date;
                return (
                  <tr key={p.code} className="prow">
                    <td>
                      <Link href={`/projects/${p.code}`} className="pcell" style={{ color: "inherit" }}><span className="code">{p.code}</span><b>{p.project_name}</b></Link>
                      <span className="cell-sub" style={{ maxWidth: 420 }}>{p.customer_name}{p.pm ? ` · PM ${p.pm}` : ""}</span>
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="num"><b>{fNum(p.done_qty, 1)}</b> <span className="muted">/ {fNum(p.order_qty)}</span></td>
                    <td><Progress pct={p.pct_done} planPct={p.pct_plan} hasPlan={p.has_plan} /></td>
                    <td><AheadChip ab={p.ahead_behind} hasPlan={p.has_plan} /></td>
                    <td className="num">{p.rate_per_day ? fNum(p.rate_per_day, 1) : "–"}</td>
                    <td className="nowrap"><span className={late ? "wk" : ""}>{fDate(p.eta)}</span><span className="cell-sub">กำหนด {fDate(p.end_date)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!shown.length && <Empty>ไม่พบโครงการ</Empty>}
        {rows.length > shown.length && <div className="sub" style={{ marginTop: 8 }}>แสดง {shown.length} จาก {rows.length} โครงการ — พิมพ์ค้นหาเพื่อกรอง</div>}
      </div>
    </>
  );
}
