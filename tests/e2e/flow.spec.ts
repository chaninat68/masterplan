import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// ทดสอบทั้งระบบด้วยไฟล์จริง: ล็อกอิน → นำเข้า 3 ไฟล์ → เปิดทุกหน้า
// ไฟล์ต้นทางอยู่นอก repo (ข้อมูลจริง) — ข้ามถ้าเครื่องนี้ไม่มี
const FILES = {
  master_planning: process.env.MP_XLSX ?? "D:/Master Planning/Master Planning 2026/M10/Master Planning Update 17-10-69 - Copy.xlsx",
  queue: process.env.QUEUE_XLSX ?? "C:/Users/s_chaninat.ASIAGROUP/Desktop/รายงานคิว-วัน-ปี 69.xlsx",
  sales: process.env.SALES_XLSX ?? "C:/Users/s_chaninat.ASIAGROUP/Desktop/ข้อมูล SO และใบเปลี่ยนแปลง ปี 2026.xlsx",
};
const TAB = { master_planning: "Master Planning", queue: "รายงานคิว-วัน (ทุกวัน)", sales: "ข้อมูล SO และใบเปลี่ยนแปลง" };
const shots = process.env.SHOTS_DIR;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("รหัสผ่าน").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("ยังไม่ล็อกอิน → ถูกพาไปหน้า login", async ({ page }) => {
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login/);
});

test("นำเข้าไฟล์จริงทั้ง 3 ไฟล์", async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL || !Object.values(FILES).every(existsSync), "ไม่มีไฟล์ต้นทาง/บัญชีทดสอบ");
  await login(page);
  for (const kind of ["master_planning", "queue", "sales"] as const) {
    await page.goto("/import");
    await page.getByRole("button", { name: TAB[kind] }).click();
    await page.locator('input[type="file"]').setInputFiles(FILES[kind]);
    await expect(page.getByRole("button", { name: "ยืนยันนำเข้า" })).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "ยืนยันนำเข้า" }).click();
    await expect(page.locator(".banner.ok, .banner.bad")).toBeVisible({ timeout: 150_000 });
    const msg = await page.locator(".banner.ok, .banner.bad").innerText();
    console.log(`[${kind}] ${msg}`);
    expect(msg).toContain("✔");
  }
});

test("เปิดทุกหน้าได้ ไม่มี error", async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, "ไม่มีบัญชีทดสอบ");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  for (const path of ["/overview", "/projects", "/projects/A69-A208", "/projects/A69-A101?tab=curve", "/projects/A69-A364?tab=so", "/daily", "/finance", "/sales", "/drive", "/import", "/settings"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForTimeout(800);
    if (shots) await page.screenshot({ path: `${shots}/${path.replace(/[/?=]/g, "_")}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("Export Excel ดาวน์โหลดได้", async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, "ไม่มีบัญชีทดสอบ");
  await login(page);
  for (const url of ["/api/export/master-planning", "/api/export/billing", "/api/export/rig-queue"]) {
    const r = await page.request.get(url);
    expect(r.status(), url).toBe(200);
    expect(r.headers()["content-type"]).toContain("spreadsheetml");
  }
});
