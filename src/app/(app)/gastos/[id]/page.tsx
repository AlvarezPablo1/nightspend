import { and, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expense-form";
import { DeleteExpenseButton } from "@/components/delete-expense-button";
import { db } from "@/db";
import * as s from "@/db/schema";
import { currentUserId } from "@/lib/auth";
import { moneyInput, today } from "@/lib/format";
import { activeCategories, activeMethods, expenseSuggestions } from "@/lib/queries";

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const userId = await currentUserId();
  const [[expense], [plan], categories, activeMethodList, allMethods, suggestions] = await Promise.all([
    db
      .select()
      .from(s.expenses)
      .where(and(eq(s.expenses.id, id), eq(s.expenses.userId, userId))),
    db
      .select()
      .from(s.installmentPlans)
      .where(and(eq(s.installmentPlans.expenseId, id), eq(s.installmentPlans.userId, userId))),
    activeCategories(userId),
    activeMethods(userId),
    db.select().from(s.paymentMethods).where(eq(s.paymentMethods.userId, userId)),
    expenseSuggestions(userId),
  ]);
  if (!expense) notFound();
  const methods = allMethods.filter(
    (m) => activeMethodList.some((a) => a.id === m.id) || m.id === expense.paymentMethodId,
  );

  return (
    <>
      <Link href={`/gastos?mes=${expense.date.slice(0, 7)}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronLeft size={18} /> Volver
      </Link>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Editar gasto</h1>
      <div className="card">
        <ExpenseForm
          key={`${expense.id}-${expense.amount}-${expense.date}`}
          options={{ categories, methods, suggestions, today: today() }}
          initial={{
            id: expense.id,
            date: expense.date,
            description: expense.description,
            categoryId: expense.categoryId,
            paymentMethodId: expense.paymentMethodId,
            amount: moneyInput(expense.amount),
            currency: expense.currency,
            rate: expense.rate,
            installments: expense.installments,
            firstMonth: plan?.firstMonth,
            note: expense.note,
          }}
        />
      </div>
      <DeleteExpenseButton id={expense.id} />
    </>
  );
}
