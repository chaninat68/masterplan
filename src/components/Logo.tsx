/** โลโก้ Master Planning — เสาเข็ม 5 ต้น (ต้นกลางสีเหลือง) บนพื้นกรมท่า */
export function LogoMark({ size = 36 }: { size?: number }) {
  const bars = [
    { x: 11, top: 13 },
    { x: 20, top: 20 },
    { x: 29, top: 28, accent: true },
    { x: 38, top: 20 },
    { x: 47, top: 13 },
  ];
  return (
    <svg className="logo-svg" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#1F2A44" />
      {bars.map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={b.top} width="6" height={46 - b.top} rx="1" fill={b.accent ? "#F5B014" : "#F4F2EE"} />
          <path d={`M${b.x} 46h6l-3 5z`} fill="#9AA8C7" />
        </g>
      ))}
      <circle cx="32" cy="21.5" r="3.5" fill="#F5B014" />
    </svg>
  );
}

export function Logo() {
  return (
    <>
      <LogoMark />
      <span className="logo-text"><b>MASTER</b><span>PLANNING</span></span>
    </>
  );
}
