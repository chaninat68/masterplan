import Link from "next/link";

export function RangeToggle({ value, asof }: { value: number; asof?: string }) {
  return (
    <div className="seg">
      {[30, 90].map((r) => (
        <Link key={r} href={`/overview?range=${r}${asof ? `&asof=${asof}` : ""}`} className={value === r ? "on" : ""} scroll={false}>
          {r} วัน
        </Link>
      ))}
    </div>
  );
}
