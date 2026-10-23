import "server-only";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_CONFIG, type PageKey } from "@/lib/roles";

/** สร้างไฟล์ .xlsx จาก array 2 มิติ แล้วส่งเป็นไฟล์ดาวน์โหลด */
export function xlsxResponse(fileName: string, sheet: string, aoa: (string | number | null)[][]): Response {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** route handler: ต้องล็อกอินและมีสิทธิ์หน้านั้น */
export async function canExport(page: PageKey): Promise<boolean> {
  const u = await getCurrentUser();
  return !!u && ROLE_CONFIG[u.role].pages.includes(page);
}

export const forbidden = () => new Response("ไม่มีสิทธิ์", { status: 403 });
