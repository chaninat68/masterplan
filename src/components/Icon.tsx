const PATHS: Record<string, string> = {
  home: "M3 11 12 4l9 7M5 10v10h14V10",
  plan: "M3 4h18v17H3zM3 9h18M8 2v4M16 2v4M7 13h4M7 17h7",
  day: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  up: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  money: "M2 6h20v13H2zM12 9.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 10v.01M18 15v.01",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  crane: "M6 21V3l12 4H6M10 21V7M6 11h4M6 15h4M18 7v6M18 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  pile: "M8 3h8v4H8zM10 7v14M14 7v14",
  cal: "M3 4h18v17H3zM3 9h18M8 2v4M16 2v4",
  alert: "M12 3 2 21h20zM12 10v5M12 18v.01",
  doc: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h5",
  check: "M20 6 9 17l-5-5",
  note: "M4 4h16v12l-4 4H4zM16 20v-4h4",
  dl: "M12 4v12M7 11l5 5 5-5M4 20h16",
  copy: "M8 8h13v13H8zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3",
  line: "M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 20l1.3-4A8.4 8.4 0 1 1 21 11.5z",
  users: "M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.5-3.5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  plus: "M12 5v14M5 12h14",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15",
};

export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
