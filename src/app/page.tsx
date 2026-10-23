import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PAGES, ROLE_CONFIG } from "@/lib/roles";

// หน้าแรกตามบทบาท
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(PAGES[ROLE_CONFIG[user.role].home].href);
}
