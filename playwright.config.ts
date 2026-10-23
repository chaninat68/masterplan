import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

// ใช้ Microsoft Edge ที่ติดตั้งในเครื่อง (ไม่ต้องดาวน์โหลดเบราว์เซอร์)
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "msedge",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
