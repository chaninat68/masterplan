"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fBaht, fNum } from "@/lib/format";

// สีอ้างอิงตาม token ใน globals.css (ธีมสว่าง/มืดสลับเอง)
const axis = { stroke: "var(--line-2)", tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false };
const grid = <CartesianGrid vertical={false} stroke="var(--line)" />;
const tip = {
  contentStyle: { background: "var(--ink)", border: 0, borderRadius: 8, color: "var(--surface)", fontSize: 12.5 },
  labelStyle: { color: "var(--surface)", fontWeight: 600 },
  itemStyle: { color: "var(--surface)" },
  cursor: { fill: "var(--accent-soft)", opacity: 0.6 },
};

export type DailyPoint = { label: string; asia: number; asia_joint: number; subcontractor: number; note?: string };
export function DailyStack({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} minTickGap={18} />
        <YAxis {...axis} axisLine={false} tickFormatter={(v) => fNum(v)} />
        <Tooltip {...tip} formatter={(v, n) => [`${fNum(Number(v))} ต้น`, n]} />
        <Bar dataKey="asia" name="เอเซีย" stackId="a" fill="var(--s1)" maxBarSize={14} />
        <Bar dataKey="asia_joint" name="เอเซียร่วม" stackId="a" fill="var(--s2)" maxBarSize={14} />
        <Bar dataKey="subcontractor" name="ผู้รับเหมาร่วม" stackId="a" fill="var(--s3)" radius={[3, 3, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, unit }: { data: { name: string; value: number; color: string }[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="74%" outerRadius="100%" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip {...tip} formatter={(v, n) => [`${fNum(Number(v))} ${unit}`, n]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SCurve({ data }: { data: { label: string; plan: number; actual: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} minTickGap={30} />
        <YAxis {...axis} axisLine={false} tickFormatter={(v) => fNum(v)} />
        <Tooltip {...tip} formatter={(v, n) => (v == null ? ["–", n] : [`${fNum(Number(v), 1)} ต้น`, n])} />
        <Area type="monotone" dataKey="actual" name="ทำจริงสะสม" stroke="var(--s1)" strokeWidth={2} fill="var(--s1)" fillOpacity={0.12} connectNulls={false} dot={false} />
        <Line type="monotone" dataKey="plan" name="แผนสะสม" stroke="var(--plan)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SalesMonthly({ data }: { data: { label: string; P: number; RC: number; net: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} axisLine={false} tickFormatter={(v) => `${fNum(v / 1e6)}ล.`} />
        <Tooltip {...tip} formatter={(v, n) => [fBaht(Number(v)), n]} />
        <Bar dataKey="P" name="P เปิดขาย" stackId="s" fill="var(--s1)" maxBarSize={22} radius={[4, 4, 0, 0]} />
        <Bar dataKey="RC" name="R+C ลด/เปลี่ยนแปลง" stackId="s" fill="var(--s2)" maxBarSize={22} radius={[0, 0, 4, 4]} />
        <Line dataKey="net" name="สุทธิ" stroke="var(--ink)" strokeWidth={2} dot={{ r: 3, fill: "var(--ink)" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function RunwayForecast({ data, warnLabel }: { data: { label: string; remain: number }[]; warnLabel?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} minTickGap={24} />
        <YAxis {...axis} axisLine={false} tickFormatter={(v) => fNum(v)} />
        <Tooltip {...tip} formatter={(v) => [`เหลือ ${fNum(Number(v))} ต้น`, ""]} />
        <Area type="linear" dataKey="remain" stroke="var(--s1)" strokeWidth={2} fill="var(--s1)" fillOpacity={0.14}
          dot={(p: { cx?: number; cy?: number; payload?: { label: string } }) =>
            p.payload?.label === warnLabel ? <circle key="w" cx={p.cx} cy={p.cy} r={6} fill="var(--bad)" stroke="var(--surface)" strokeWidth={2} /> : <g key={`${p.cx}`} />}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HBar({ data, money }: { data: { name: string; value: number }[]; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--line)" />
        <XAxis type="number" {...axis} tickFormatter={(v) => (money ? `${fNum(v / 1e6)}ล.` : fNum(v))} />
        <YAxis type="category" dataKey="name" {...axis} width={90} axisLine={false} />
        <Tooltip {...tip} formatter={(v) => [money ? fBaht(Number(v)) : fNum(Number(v)), ""]} />
        <Bar dataKey="value" fill="var(--s1)" radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
