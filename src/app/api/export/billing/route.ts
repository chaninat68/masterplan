import { createClient } from "@/lib/supabase/server";
import { resolveAsof } from "@/lib/data";
import { BILLING_HEADERS, billingRow, getBilling } from "@/lib/billing";
import { canExport, forbidden, xlsxResponse } from "@/lib/xlsxResponse";

export async function GET(req: Request) {
  if (!(await canExport("finance"))) return forbidden();
  const supabase = await createClient();
  const { pick } = await resolveAsof(supabase, new URL(req.url).searchParams.get("asof"));
  const { month, rows } = await getBilling(supabase, pick);
  return xlsxResponse(`รายงานวางบิล ${month}.xlsx`, "วางบิล", [BILLING_HEADERS, ...rows.map(billingRow)]);
}
