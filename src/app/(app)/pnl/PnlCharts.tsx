"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { stroke: "var(--line-2)", tick: { fill: "var(--muted)", fontSize: 11.5 }, tickLine: false };
const tip = {
  contentStyle: { background: "var(--ink)", border: 0, borderRadius: 8, color: "var(--surface)", fontSize: 12.5 },
  labelStyle: { color: "var(--surface)", fontWeight: 600 },
  itemStyle: { color: "var(--surface)" },
  cursor: { fill: "var(--p-teal-soft)", opacity: 0.6 },
};
const pct = (v: number) => `${(v * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;

/** % กำไรของแต่ละส่วนตามปีของโครงการ (การ์ด ผลิต / ตอก / ขนส่ง) */
export function YearArea({ data, color, id }: { data: { label: string; value: number }[]; color: string; id: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} axisLine={false} tickFormatter={(v) => pct(Number(v))} width={52} />
        <Tooltip {...tip} formatter={(v) => [pct(Number(v)), "% กำไร"]} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#g-${id})`} dot={{ r: 4, fill: color, strokeWidth: 0 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** กำไรสุทธิรายโครงการ (% รายได้) เรียงมาก→น้อย: กำไร = เขียวเข้ม, ขาดทุน = ส้ม */
export function NetBars({ data }: { data: { name: string; value: number; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="name" {...axis} tick={false} height={6} />
        <YAxis {...axis} axisLine={false} tickFormatter={(v) => pct(Number(v))} width={56} />
        <ReferenceLine y={0} stroke="var(--line-2)" />
        <Tooltip
          {...tip}
          formatter={(v, _n, item) => [`${pct(Number(v))} · ${(Number(item.payload.amount) / 1e6).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ล้าน`, "กำไรสุทธิ"]}
        />
        <Bar dataKey="value" maxBarSize={10} radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.name} fill={d.value >= 0 ? "var(--p-teal)" : "var(--p-orange)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CostDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip {...tip} formatter={(v, n) => [`${(Number(v) / 1e6).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ล้าน (${pct(Number(v) / total)})`, n]} />
      </PieChart>
    </ResponsiveContainer>
  );
}
