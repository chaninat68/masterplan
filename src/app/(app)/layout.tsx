import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAGES, ROLE_CONFIG } from "@/lib/roles";
import { fDate, fNum } from "@/lib/format";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) {
    // ล็อกอินแล้วแต่ไม่มี profile หรือถูกปิดใช้งาน
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) redirect("/login");
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1 style={{ fontSize: 20 }}>บัญชีนี้ยังไม่เปิดใช้งาน</h1>
          <p className="muted">กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดบทบาทให้บัญชีของคุณ</p>
          <Link className="btn" href="/login">กลับหน้าเข้าสู่ระบบ</Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: bl } = await supabase.from("v_backlog").select("asof, runway_weeks, level").maybeSingle();
  const cfg = ROLE_CONFIG[user.role];
  // ไม่แสดงตัวเลขแจ้งเตือนที่เมนู (ผู้ใช้สั่ง 6 พ.ย. 2569)
  const nav = cfg.pages.map((k) => PAGES[k]);
  const lvl = bl?.level === "red" ? "bad" : bl?.level === "amber" ? "warn" : "good";

  return (
    <Shell
      nav={nav}
      userName={user.name}
      roleLabel={cfg.label}
      canEdit={user.canEdit}
      sideCard={
        <>
          <b>ข้อมูลล่าสุด {fDate(bl?.asof)}</b>
          ผลงานตอกจากไฟล์คิว-วัน · แผนจาก Master Planning
          <div style={{ marginTop: 8 }}>
            Runway{" "}
            <b style={{ display: "inline", color: `var(--${lvl}-ink)` }}>
              {bl?.runway_weeks != null ? fNum(Number(bl.runway_weeks), 1) : "∞"} สัปดาห์
            </b>
          </div>
          {user.canEdit && (
            <Link className="btn sm" href="/import" style={{ marginTop: 10 }}>
              <Icon name="up" />
              นำเข้าไฟล์วันนี้
            </Link>
          )}
        </>
      }
    >
      {children}
    </Shell>
  );
}
