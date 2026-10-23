import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="logo" style={{ padding: "0 0 8px" }}>
          <div className="logo-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M8 3h8v4H8zM10 7v14M14 7v14" />
            </svg>
          </div>
          MasterPlan
        </div>
        <h1 style={{ margin: "8px 0 2px", fontSize: 22, fontWeight: 600 }}>เข้าสู่ระบบ</h1>
        <p className="muted" style={{ marginTop: 0 }}>Master Planning Dashboard · งานตอกเสาเข็ม</p>
        <LoginForm />
        <p className="sub" style={{ marginTop: 16 }}>ยังไม่มีบัญชี? ติดต่อผู้ดูแลระบบเพื่อเพิ่มผู้ใช้</p>
      </div>
    </div>
  );
}
