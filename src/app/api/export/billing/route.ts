import { createClient } from "@/lib/supabase/server";
import { BILLING_HEADERS, billingRow, getBilling } from "@/lib/billing";
import { canExport, forbidden, xlsxResponse } from "@/lib/xlsxResponse";

export async function GET() {
  if (!(await canExport("finance"))) return forbidden();
  const supabase = await createClient();
  const { month, rows } = await getBilling(supabase);
  return xlsxResponse(`รายงานวางบิล ${month}.xlsx`, "วางบิล", [BILLING_HEADERS, ...rows.map(billingRow)]);
}
