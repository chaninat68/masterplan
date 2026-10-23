import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { fDate, fNum, STATUS_LABEL } from "@/lib/format";

export function PageHeader({ title, sub, right, asof, readOnly }: { title: ReactNode; sub: ReactNode; right?: ReactNode; asof?: string; readOnly?: boolean }) {
  return (
    <div className="hello">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {readOnly && <span className="chip ro">ดูอย่างเดียว</span>}
        {right}
        {asof && (
          <span className="chip">
            <Icon name="cal" size={16} />
            ข้อมูลถึง {fDate(asof)}
          </span>
        )}
      </div>
    </div>
  );
}

type Tone = "blue" | "green" | "amber" | "red";
export function Kpi({ tone, icon, label, value, unit, cmp }: { tone: Tone; icon: string; label: ReactNode; value: ReactNode; unit?: string; cmp?: ReactNode }) {
  return (
    <div className={`card kpi-card t-${tone}`}>
      <div className="kpi">
        <div className={`ic ${tone}`}>
          <Icon name={icon} />
        </div>
        <div>
          <div className="lbl">{label}</div>
          <div className="val">
            {value}
            {unit && <small>{unit}</small>}
          </div>
          {cmp}
        </div>
      </div>
    </div>
  );
}

/** ↑ 12.3% เทียบ ... */
export function Delta({ cur, prev, label }: { cur: number; prev: number; label: string }) {
  const v = prev ? ((cur - prev) / prev) * 100 : 0;
  return (
    <div className="cmp">
      <span className={v >= 0 ? "up" : "down"}>
        {v >= 0 ? "↑" : "↓"} {fNum(Math.abs(v), 1)}%
      </span>{" "}
      {label}
    </div>
  );
}

/** ชิปเร็ว/ช้ากว่าแผน */
export function AheadChip({ ab, hasPlan }: { ab: number; hasPlan: boolean }) {
  if (!hasPlan) return <span className="dc n">ไม่มีแผน</span>;
  if (ab >= 0.5) return <span className="dc g">▲ เร็ว +{fNum(ab, 1)}</span>;
  if (ab <= -0.5) return <span className="dc r">▼ ช้า {fNum(ab, 1)}</span>;
  return <span className="dc n">● ตามแผน</span>;
}

/** แถบความคืบหน้า + ขีดตำแหน่งแผน */
export function Progress({ pct, planPct, hasPlan }: { pct: number; planPct: number; hasPlan: boolean }) {
  return (
    <div className="prog">
      <div className="bar">
        <i style={{ width: `${(pct * 100).toFixed(1)}%` }} />
        {hasPlan && <b style={{ left: `calc(${(planPct * 100).toFixed(1)}% - 1px)` }} title={`ตำแหน่งแผน ${Math.round(planPct * 100)}%`} />}
      </div>
      <span>{Math.round(pct * 100)}%</span>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge st-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function CardHead({ title, sub, href, linkLabel = "ดูทั้งหมด", right }: { title: ReactNode; sub?: ReactNode; href?: string; linkLabel?: string; right?: ReactNode }) {
  return (
    <div className="card-h">
      <div>
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
      {href && (
        <Link className="link" href={href}>
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
