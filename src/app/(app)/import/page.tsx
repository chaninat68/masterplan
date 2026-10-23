import type { Metadata } from "next";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAsof } from "@/lib/data";
import { PageHeader, CardHead, Empty } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ImportPanel } from "./ImportPanel";
import { UndoButton } from "./UndoButton";

export const metadata: Metadata = { title: "นำเข้าไฟล์" };

const KIND_LABEL = { queue: "คิว-วัน", master_planning: "Master Planning", sales: "SO" } as const;

export default async function ImportPage() {
  const user = await requirePage("import");
  const supabase = await createClient();
  const [asof, { data: batches }] = await Promise.all([
    getAsof(supabase),
    supabase.from("import_batches").select("id, kind, file_name, rows_added, rows_duplicate, rows_error, created_at, undone_at").order("created_at", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <PageHeader title="นำเข้าไฟล์" sub="ลากไฟล์ที่ได้รับมาวาง ตรวจตัวอย่าง แล้วกดยืนยัน — ทุกหน้าอัพเดททันที" asof={asof} readOnly={!user.canEdit} />
      <div className="grid g64 mb">
        <ImportPanel />
        <div className="card">
          <CardHead title="ขั้นตอนประจำวัน" sub="ฝ่าย Planning นำเข้าเองทุกวัน · ไฟล์คิว-วันคือผลงานจริง" />
          <div className="list">
            <div className="li"><div className="ic" style={{ background: "var(--i-blue)", color: "var(--s1)" }}><Icon name="doc" /></div><div className="t"><b>1. รับไฟล์ &quot;รายงานคิว-วัน&quot; จากทีมตอก</b><span>ไฟล์สะสมทั้งปี รูปแบบเดิมทุกวัน</span></div></div>
            <div className="li"><div className="ic" style={{ background: "var(--i-amber)", color: "var(--warn-ink)" }}><Icon name="up" /></div><div className="t"><b>2. ลากไฟล์มาวาง แล้วตรวจตัวอย่าง</b><span>ดูเฉพาะแถวใหม่ / แถวผิด / โครงการใหม่</span></div></div>
            <div className="li"><div className="ic" style={{ background: "var(--i-green)", color: "var(--good-ink)" }}><Icon name="check" /></div><div className="t"><b>3. กดยืนยัน — ทุกหน้าอัพเดททันที</b><span>นำเข้าผิดกดย้อนกลับได้ในประวัติด้านล่าง</span></div></div>
          </div>
          <p className="sub" style={{ marginTop: 14 }}>
            เริ่มระบบครั้งแรก: นำเข้า <b>Master Planning</b> → <b>คิว-วัน</b> → <b>SO</b> ตามลำดับ
          </p>
        </div>
      </div>
      <div className="card">
        <CardHead title="ประวัติการนำเข้า" sub="30 รายการล่าสุด" />
        {batches?.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>ไฟล์</th><th>ชนิด</th><th>เวลา</th><th className="num">เพิ่ม</th><th className="num">ซ้ำ/แทนที่</th><th className="num">ผิด</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.file_name}</td>
                    <td>{KIND_LABEL[b.kind as keyof typeof KIND_LABEL]}</td>
                    <td className="nowrap">{new Date(b.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="num tag-new">{b.rows_added.toLocaleString("th-TH")}</td>
                    <td className="num">{b.rows_duplicate.toLocaleString("th-TH")}</td>
                    <td className="num tag-err">{b.rows_error}</td>
                    <td>{b.undone_at ? <span className="dc n">ย้อนกลับแล้ว</span> : <span className="dc g">สำเร็จ</span>}</td>
                    <td>{!b.undone_at && b.kind === "queue" && <UndoButton id={b.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>ยังไม่มีการนำเข้า</Empty>
        )}
      </div>
    </>
  );
}
