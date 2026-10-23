"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { signOut } from "@/app/login/actions";

type NavItem = { href: string; label: string; icon: string; badge?: number };

export function Shell(props: {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  canEdit: boolean;
  behind: number;
  sideCard: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  function toggleTheme() {
    const r = document.documentElement;
    const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    r.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem("mp-theme", r.dataset.theme);
    } catch {}
  }

  return (
    <div className="app">
      <aside className={`side ${open ? "open" : ""}`}>
        <Link href="/" className="logo" style={{ color: "inherit" }}>
          <div className="logo-mark">
            <Icon name="pile" size={20} />
          </div>
          MasterPlan
        </Link>
        <nav className="nav">
          {props.nav.map((n) => (
            <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? "on" : ""} onClick={() => setOpen(false)}>
              <Icon name={n.icon} />
              {n.label}
              {!!n.badge && <span className="count">{n.badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="side-card">{props.sideCard}</div>
      </aside>
      <div className={`scrim ${open ? "show" : ""}`} onClick={() => setOpen(false)} />
      <main className="main">
        <div className="top">
          <button className="icon-btn burger" aria-label="เมนู" onClick={() => setOpen(true)}>
            <Icon name="menu" size={20} />
          </button>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/projects?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Icon name="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัสโครงการ, ชื่อโครงการ, ลูกค้า…" />
            <kbd>Enter</kbd>
          </form>
          <div className="top-right">
            <button className="icon-btn" title="สลับธีม" onClick={toggleTheme}>
              <Icon name="moon" size={19} />
            </button>
            <Link className="icon-btn" title="โครงการช้ากว่าแผน" href="/projects?tab=ongoing">
              <Icon name="bell" size={19} />
              {props.behind > 0 && <span className="dot">{props.behind}</span>}
            </Link>
            <div className="me">
              <div className="avatar">{props.userName.slice(0, 1).toUpperCase()}</div>
              <div className="who">
                <b>{props.userName}</b>
                <span className="muted" style={{ fontSize: 12 }}>
                  {props.roleLabel}
                </span>
              </div>
              <form action={signOut}>
                <button className="icon-btn" title="ออกจากระบบ" style={{ width: 32, height: 32 }}>
                  <Icon name="logout" size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
        <div className={props.canEdit ? "can-edit" : ""}>{props.children}</div>
      </main>
    </div>
  );
}
