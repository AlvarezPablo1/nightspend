import { requireSession } from "@/lib/auth";
import { buildExpensesCsv, buildWorkbook } from "@/lib/export";
import { isMonth, today } from "@/lib/format";
import { availableMonths } from "@/lib/queries";
import { ensureRecurringIncomes } from "@/lib/recurring-incomes";

export async function GET(request: Request, { params }: { params: Promise<{ format: string }> }) {
  await requireSession();
  const { format } = await params;
  if (format !== "csv" && format !== "excel") return new Response("No encontrado", { status: 404 });

  // Hay que indicar qué descargar: un mes con datos o "todos".
  const mes = new URL(request.url).searchParams.get("mes");
  const all = mes === "todos";
  if (!all && !isMonth(mes)) return new Response("Indicá el mes a descargar", { status: 400 });
  await ensureRecurringIncomes();
  if (!all && !(await availableMonths()).includes(mes!)) return new Response("Ese mes no tiene datos", { status: 404 });

  const month = all ? null : mes!;
  const stamp = all ? `todos-${today()}` : mes;
  const headers = (type: string, extension: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="gastos-${stamp}.${extension}"`,
    "Cache-Control": "no-store",
  });

  if (format === "csv") {
    return new Response(await buildExpensesCsv(month), { headers: headers("text/csv; charset=utf-8", "csv") });
  }
  return new Response(await buildWorkbook(month), {
    headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
  });
}
