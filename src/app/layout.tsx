import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "MasterPlan", template: "%s · MasterPlan" },
  description: "Master Planning Dashboard — แผนและผลงานตอกเสาเข็ม",
  robots: { index: false, follow: false },
};

// ตั้งธีมก่อนวาดหน้า (กันจอกระพริบ)
const themeScript = `try{var t=localStorage.getItem('mp-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={prompt.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
