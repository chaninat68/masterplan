import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProjects, resolveAsof, type ProjectStatus } from "@/lib/data";
import { fDate, fNum, STATUS_LABEL } from "@/lib/format";
import { AheadChip, Empty, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AddProject, DeleteProject, StatusSelect } from "./ProjectControls";

export const metadata: Metadata = { title: "แผน / ผลงาน" };

const TABS: (ProjectStatus | "all")[] = ["ongoing", "on_hand", "hold", "completed", "cancelled", "all"];
const OPEN: ProjectStatus[] = ["ongoing", "on_hand", "hold"];
/** แผนรวม − ยอดสั่งซื้อ ของโครงการที่ยังไม่จบและมีแผน (ผู้ใช้สั่ง 28 พ.ย. 2569: ให้ขึ้นโครงการที่แผนไม่ตรงสั่งซื้อมาแก้) */
const planDiff = (p: { status: ProjectStatus; has_plan: boolean; plan_total: number; order_qty: number | null }) =>
  OPEN.includes(p.status) && p.has_plan && p.order_qty ? Math.round(p.plan_total - Number(p.order_qty)) : 0;

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const user = await requirePage("projects");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const fix = sp.tab === "planfix";
  const tab = (typeof sp.tab === "string" && TABS.includes(sp.tab as ProjectStatus) ? sp.tab : "ongoing") as ProjectStatus | "all";
  const supabase = await createClient();
  const { latest, asof, pick } = await resolveAsof(supabase, sp.asof);
  const all = await getProjects(supabase, { asof: pick });
  const at = pick ? `&asof=${pick}` : "";

  let rows = q
    ? all.filter((p) => `${p.code} ${p.project_name} ${p.customer_name} ${p.pm} ${p.sales}`.toLowerCase().includes(q.toLowerCase()))
    : fix ? all.filter((p) => planDiff(p) !== 0)
    : all.filter((p) => tab === "all" || p.status === tab);
  rows = fix ? rows.sort((a, b) => Math.abs(planDiff(b)) - Math.abs(planDiff(a))) : rows.sort((a, b) =>
    a.status === "ongoing" && b.status === "ongoing" ? a.ahead_behind - b.ahead_behind : (b.start_date ?? "").localeCompare(a.start_date ?? ""));
  const shown = rows.slice(0, 200);
  const ce = user.canEdit;
  const nFix = all.filter((p) => planDiff(p) !== 0).length;
  const count = (s: ProjectStatus | "all") => (s === "all" ? all.length : all.filter((p) => p.status === s).length);

  return (
    <>
      <PageHeader title="แผน / ผลงานรายโครงการ" sub="คลิกโครงการเพื่อดูแผนเทียบผลงานรายวัน — ตอกด้วยปั้นจั่นไหน ขนาดอะไร ยาวเท่าไร กะไหน" asof={asof} latest={latest} readOnly={!user.canEdit} />
      <div className="card">
        <div className="toolbar">
          <div className="seg">
            {TABS.map((t) => (
              <Link key={t} href={`/projects?tab=${t}${at}`} className={!q && !fix && tab === t ? "on" : ""}>
                {t === "all" ? "ทั้งหมด" : STATUS_LABEL[t]}<span className="n">{count(t)}</span>
              </Link>
            ))}
          </div>
          {nFix > 0 && (
            <div className="seg">
              <Link href={`/projects?tab=planfix${at}`} className={!q && fix ? "on" : ""} title="แผนรวมมากกว่าหรือน้อยกว่ายอดสั่งซื้อ (Ongoing / On Hand / Hold)">
                แผนไม่ตรงสั่งซื้อ<span className="n" style={{ background: "var(--bad-soft)", color: "var(--bad-ink)" }}>{nFix}</span>
              </Link>
            </div>
          )}
          <div className="grow" />
          <form action="/projects" style={{ display: "flex", gap: 8 }}>
            {pick && <input type="hidden" name="asof" value={pick} />}
            <input className="input" name="q" defaultValue={q} placeholder="ค้นหาในตาราง…" style={{ width: 220 }} />
          </form>
          <a className="btn ghost sm" href="/api/export/master-planning"><Icon name="dl" />Export Master Planning</a>
          {ce && <AddProject />}
        </div>
        {fix && !q && <div className="sub" style={{ marginBottom: 8 }}>แผนรวมไม่เท่ายอดสั่งซื้อ {rows.length} โครงการ — คลิกโครงการเพื่อแก้แผน (แถวแผนงานในตารางรายวัน หรืออัปโหลดไฟล์แผน)</div>}
        {q && <div className="sub" style={{ marginBottom: 8 }}>ผลการค้นหา &quot;{q}&quot; {rows.length} โครงการ · <Link href="/projects" className="link">ล้าง</Link></div>}
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>โครงการ / ลูกค้า</th><th>สถานะ</th><th className="num">ตอกแล้ว / สั่งซื้อ</th><th style={{ minWidth: 170 }}>ความคืบหน้า</th><th>เทียบแผน</th><th className="num">อัตรา/วัน</th><th>คาดเสร็จ</th>{ce && <th aria-label="ลบ" />}</tr></thead>
            <tbody>
              {shown.map((p) => {
                const d = planDiff(p);
                return (
                  <tr key={p.code} className="prow">
                    <td>
                      <Link href={`/projects/${p.code}${pick ? `?asof=${pick}` : ""}`} className="pcell" style={{ color: "inherit" }}><span className="code">{p.code}</span><b>{p.project_name}</b></Link>
                      {ce && !p.has_plan && (p.status === "on_hand" || p.status === "ongoing") && <span className="dc n" style={{ marginLeft: 6 }}>รอวางแผน</span>}
                      {d !== 0 && <span className={`dc ${d > 0 ? "a" : "r"}`} style={{ marginLeft: 6 }} title={`แผนรวม ${fNum(p.plan_total)} / สั่งซื้อ ${fNum(p.order_qty)}`}>แผน{d > 0 ? "เกิน" : "ขาด"} {fNum(Math.abs(d))} ต้น</span>}
                      <span className="cell-sub" style={{ maxWidth: 420 }}>{p.customer_name}{p.pm ? ` · PM ${p.pm}` : ""}</span>
                    </td>
                    <td>{ce ? <StatusSelect code={p.code} status={p.status} /> : <StatusBadge status={p.status} />}</td>
                    <td className="num"><b>{fNum(p.done_qty, 1)}</b> <span className="muted">/ {fNum(p.order_qty)}</span></td>
                    <td><Progress pct={p.pct_done} planPct={p.pct_plan} hasPlan={p.has_plan} /></td>
                    <td><AheadChip ab={p.ahead_behind} hasPlan={p.has_plan} /></td>
                    <td className="num">{p.rate_per_day ? fNum(p.rate_per_day, 1) : "–"}</td>
                    <td className="nowrap">{fDate(p.eta)}</td>
                    {ce && <td>{p.done_qty === 0 && <DeleteProject code={p.code} name={p.project_name} />}</td>}
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
