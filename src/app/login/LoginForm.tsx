"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="form-col">
      <label>
        อีเมล
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        รหัสผ่าน
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <div className="form-err">{state.error}</div>}
      <button className="btn" disabled={pending} style={{ justifyContent: "center" }}>
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
