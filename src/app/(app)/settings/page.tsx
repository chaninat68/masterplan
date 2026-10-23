import type { Metadata } from "next";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAGES, ROLE_CONFIG, type Role } from "@/lib/roles";
import { fNum } from "@/lib/format";
import { CardHead, Empty, PageHeader } from "@/components/ui";
import { InlineEdit } from "@/components/InlineEdit";
import { setSetting } from "../projects/actions";
import { updateUser } from "./actions";

export const metadata: Metadata = { title: "ตั้งค่า" };

const CAT = { asia: "เอเซีย", asia_joint: "เอเซียร่วม", subcontractor: "ผู้รับเหมาร่วม" } as const;

export default async function SettingsPage() {
  const user = await requirePage("settings");
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const [{ data: users }, { data: settings }, { data: sizes }, { data: companies }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, active").order("created_at"),
    supabase.from("settings").select("key, value, description"),
    supabase.from("pile_sizes").select("section, code").order("code"),
    supabase.from("companies").select("id, name, category").order("name"),
  ]);
  const setting = (k: string) => String(settings?.find((s) => s.key === k)?.value ?? "");
  const roleOptions = (Object.keys(ROLE_CONFIG) as Role[]).map((r) => ({ value: r, label: ROLE_CONFIG[r].label }));

  return (
    <>
      <PageHeader title="ตั้งค่าระบบ" sub="ผู้ใช้ บทบาท เกณฑ์แจ้งเตือน และข้อมูลหลัก" readOnly={!user.canEdit} />
      <div className="grid g2 mb">
        <div className="card">
          <CardHead title="ผู้ใช้และบทบาท" sub={isAdmin ? "เปลี่ยนบทบาท / ปิดการใช้งานได้ที่นี่ · เพิ่มผู้ใช้ใหม่ใน Supabase → Authentication → Add user" : "เฉพาะผู้ดูแลระบบแก้ไขได้"} />
          {users?.length ? (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>ผู้ใช้</th><th>บทบาท</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td><InlineEdit canEdit={isAdmin} value={u.full_name} placeholder="+ ชื่อ" onSave={updateUser.bind(null, u.id, "full_name")} /><span className="cell-sub">{u.email}</span></td>
                      <td><InlineEdit canEdit={isAdmin} type="select" value={u.role} display={ROLE_CONFIG[u.role as Role].label} options={roleOptions} onSave={updateUser.bind(null, u.id, "role")} /></td>
                      <td><InlineEdit canEdit={isAdmin} type="select" value={String(u.active)} display={u.active ? <span className="dc g">ใช้งาน</span> : <span className="dc n">ปิด</span>}
                        options={[{ value: "true", label: "ใช้งาน" }, { value: "false", label: "ปิด" }]} onSave={updateUser.bind(null, u.id, "active")} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>เห็นเฉพาะบัญชีของตัวเอง</Empty>}
        </div>
        <div className="card">
          <CardHead title="เกณฑ์แจ้งเตือน" sub="ใช้ในหน้า ยอดขาย & Runway และภาพรวม" />
          <div className="fields" style={{ border: 0, padding: 0 }}>
            <div><label>เตือนเร่งขายเมื่อ Runway ต่ำกว่า (สัปดาห์)</label><b style={{ fontSize: 20 }}><InlineEdit canEdit={user.canEdit} type="number" width={70} value={setting("runway_weeks")} onSave={setSetting.bind(null, "runway_weeks")} /></b></div>
            <div><label>อัตราตอกเฉลี่ยคิดจาก (วัน)</label><b style={{ fontSize: 20 }}><InlineEdit canEdit={user.canEdit} type="number" width={70} value={setting("rate_window_days")} onSave={setSetting.bind(null, "rate_window_days")} /></b></div>
            <div><label>ใช้ Actual จาก Master Planning ก่อนวันที่</label>{setting("legacy_actual_cutoff")}</div>
          </div>
          <CardHead title="สิทธิ์ของแต่ละบทบาท" />
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>บทบาท</th><th>หน้าแรก</th><th>สิทธิ์</th></tr></thead>
              <tbody>{(Object.keys(ROLE_CONFIG) as Role[]).map((r) => (
                <tr key={r}><td><b>{ROLE_CONFIG[r].label}</b><span className="cell-sub" style={{ whiteSpace: "normal" }}>{ROLE_CONFIG[r].pages.map((p) => PAGES[p].label).join(", ")}</span></td>
                  <td>{PAGES[ROLE_CONFIG[r].home].label}</td><td>{ROLE_CONFIG[r].canEdit ? <span className="dc g">แก้ไขได้</span> : <span className="dc n">ดูอย่างเดียว</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="grid g2">
        <div className="card">
          <CardHead title="ขนาดเสาเข็ม" sub="หน้าตัด → ขนาด (แทน VLOOKUP แท็บ ขนาด)" />
          <div className="tbl-wrap" style={{ maxHeight: 320, overflow: "auto" }}>
            <table><thead><tr><th>ขนาด</th><th className="num">หน้าตัด</th></tr></thead>
              <tbody>{sizes?.map((s) => <tr key={s.section}><td><b>{s.code}</b></td><td className="num">{fNum(Number(s.section), 1)}</td></tr>)}</tbody></table>
          </div>
        </div>
        <div className="card">
          <CardHead title="บริษัทปั้นจั่น" sub="จัดกลุ่มอัตโนมัติจากไฟล์คิว-วัน" />
          {companies?.length ? (
            <div className="tbl-wrap" style={{ maxHeight: 320, overflow: "auto" }}>
              <table><thead><tr><th>ชื่อในไฟล์</th><th>กลุ่ม</th></tr></thead>
                <tbody>{companies.map((c) => <tr key={c.id}><td>{c.name}</td><td>{CAT[c.category as keyof typeof CAT]}</td></tr>)}</tbody></table>
            </div>
          ) : <Empty>ยังไม่มีข้อมูล — นำเข้าไฟล์คิว-วัน</Empty>}
        </div>
      </div>
    </>
  );
}
