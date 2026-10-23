import Link from "next/link";

export function RangeToggle({ value }: { value: number }) {
  return (
    <div className="seg">
      {[30, 90].map((r) => (
        <Link key={r} href={`/overview?range=${r}`} className={value === r ? "on" : ""} scroll={false}>
          {r} วัน
        </Link>
      ))}
    </div>
  );
}
