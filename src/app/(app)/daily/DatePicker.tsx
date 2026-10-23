"use client";

import { useRouter } from "next/navigation";

export function DatePicker({ value }: { value: string }) {
  const router = useRouter();
  return <input type="date" className="input" value={value} onChange={(e) => e.target.value && router.push(`/daily?date=${e.target.value}`)} />;
}
