"use server";

import { eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Currency } from "@/db/schema";
import { checkPassword, currentSession, requireSession } from "@/lib/auth";
import { createGuest, destroyGuest, GuestLimitError, guestModeEnabled } from "@/lib/guest";
import { isDollarType, lookupRate, type RateSide } from "@/lib/dollar";
import { addMonths, currentMonth, isDate, isMonth, parseMoney, today } from "@/lib/format";
import {
  GUEST_SESSION_HOURS,
  SESSION_COOKIE,
  SESSION_DAYS,
  signGuestSession,
  signOwnerSession,
} from "@/lib/session";

export type ActionResult = { error?: string; ok?: boolean } | void;

class FormError extends Error {}

/** Envuelve una acción: exige sesión, traduce errores, refresca la UI y redirige si la acción devuelve una ruta. */
function action(fn: (form: FormData) => Promise<string | void>) {
  return async (form: FormData): Promise<ActionResult> => {
    await requireSession();
    let destination: string | void;
    try {
      destination = await fn(form);
    } catch (e) {
      if (e instanceof FormError) return { error: e.message };
      throw e;
    }
    revalidatePath("/", "layout");
    // Si la acción borró lo que se estaba viendo, hay que salir de esa página.
    if (destination) redirect(destination, RedirectType.replace);
    return { ok: true };
  };
}

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const optional = (f: FormData, k: string) => str(f, k) || null;

function required(f: FormData, k: string, label: string) {
  const v = str(f, k);
  if (!v) throw new FormError(`Falta ${label}`);
  return v;
}

function id(f: FormData, k = "id") {
  const n = Number(str(f, k));
  if (!Number.isInteger(n) || n <= 0) throw new FormError("Dato inválido");
  return n;
}

const optionalId = (f: FormData, k: string) => (str(f, k) ? id(f, k) : null);

function amount(f: FormData, k = "amount") {
  const cents = parseMoney(str(f, k));
  if (cents == null || cents <= 0) throw new FormError("Ingresá un monto válido");
  return cents;
}

async function requiredMethod(f: FormData) {
  const methodId = optionalId(f, "paymentMethodId");
  if (!methodId) throw new FormError("Elegí el medio de pago");
  const [method] = await db.select({ id: s.paymentMethods.id }).from(s.paymentMethods).where(eq(s.paymentMethods.id, methodId));
  if (!method) throw new FormError("Elegí el medio de pago");
  return methodId;
}

const optionalAmount = (f: FormData, k: string) => (str(f, k) ? amount(f, k) : null);

function dateField(f: FormData, k = "date") {
  const v = str(f, k);
  if (!isDate(v)) throw new FormError("Ingresá una fecha válida");
  return v;
}

function currency(f: FormData): Currency {
  return str(f, "currency") === "USD" ? "USD" : "ARS";
}

type SavedRate = { date: string; currency: Currency; rate: string | null };

/**
 * Pasa el monto a pesos. Prioridad: cotización escrita a mano, la ya guardada si la
 * fecha no cambió (editar un gasto viejo no debe alterar su valor), y si no, la del día.
 */
async function convert(
  f: FormData,
  cents: number,
  cur: Currency,
  date: string,
  side: RateSide,
  saved?: SavedRate,
) {
  if (cur === "ARS") return { rate: null, amountArs: cents };

  let rate: number | null = null;
  if (str(f, "rate")) {
    const typed = parseMoney(str(f, "rate"));
    if (!typed) throw new FormError("La cotización no es válida");
    rate = typed / 100;
  } else if (saved?.rate && saved.currency === "USD" && saved.date === date) {
    rate = Number(saved.rate);
  } else {
    rate = (await lookupRate(date, side))?.rate ?? null;
    if (!rate) throw new FormError("No pude obtener la cotización. Tocá \"Usar otra cotización\" y cargala a mano.");
  }
  return { rate: String(rate), amountArs: Math.round(cents * rate) };
}

// ---------- Sesión ----------

export async function login(form: FormData): Promise<ActionResult> {
  const windowStart = new Date(Date.now() - 15 * 60_000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(s.loginFailures)
    .where(gte(s.loginFailures.at, windowStart));
  if (count >= 5) return { error: "Demasiados intentos. Probá de nuevo en 15 minutos." };

  if (!checkPassword(str(form, "password"))) {
    await db.insert(s.loginFailures).values({});
    return { error: "Contraseña incorrecta" };
  }
  await db.delete(s.loginFailures);
  await setSessionCookie(await signOwnerSession(), SESSION_DAYS * 86_400);
  redirect("/");
}

async function setSessionCookie(token: string, maxAge: number) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function enterAsGuest(): Promise<ActionResult> {
  if (!guestModeEnabled()) return { error: "El modo invitado no está disponible." };
  let guestId: string;
  try {
    guestId = await createGuest();
  } catch (error) {
    if (error instanceof GuestLimitError) return { error: error.message };
    console.error("No se pudo crear el espacio de invitado", error);
    return { error: "No se pudo preparar el modo invitado. Probá de nuevo." };
  }
  await setSessionCookie(await signGuestSession(guestId), GUEST_SESSION_HOURS * 3_600);
  redirect("/");
}

export async function logout() {
  const session = await currentSession();
  if (session?.role === "guest") await destroyGuest(session.guestId);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- Gastos ----------

async function expenseValues(f: FormData, saved?: SavedRate) {
  const cents = amount(f);
  const cur = currency(f);
  const date = dateField(f);
  return {
    date,
    description: required(f, "description", "la descripción"),
    categoryId: id(f, "categoryId"),
    paymentMethodId: await requiredMethod(f),
    amount: cents,
    currency: cur,
    note: optional(f, "note"),
    ...(await convert(f, cents, cur, date, "venta", saved)),
  };
}

function installmentCount(f: FormData) {
  const n = Number(str(f, "installments") || "1");
  if (!Number.isInteger(n) || n < 1 || n > 60) throw new FormError("Las cuotas van de 1 a 60");
  return n;
}

function planValues(f: FormData, values: Awaited<ReturnType<typeof expenseValues>>, n: number) {
  const first = str(f, "firstMonth");
  return {
    description: values.description,
    paymentMethodId: values.paymentMethodId,
    totalAmount: values.amount,
    currency: values.currency,
    installments: n,
    firstMonth: isMonth(first) ? first : addMonths(values.date.slice(0, 7), 1),
  };
}

type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

function otherOwner(f: FormData) {
  if (str(f, "isMine") !== "no") return null;
  return {
    person: required(f, "otherPerson", "quién te tiene que pasar la plata"),
    owed: str(f, "debtAmount") ? amount(f, "debtAmount") : null,
  };
}

function createDebtFor(tx: DbOrTx, person: string, concept: string, owed: number, cur: Currency) {
  return tx
    .insert(s.debts)
    .values({ direction: "me_deben", person, concept, amount: owed, currency: cur })
    .returning({ id: s.debts.id });
}

export const saveExpense = action(async (f) => {
  const existing = str(f, "id") ? id(f) : null;

  // Compra para otra persona: no es un gasto propio, solo cuotas por pagar y una deuda a favor.
  const owner = existing ? null : otherOwner(f);
  if (owner) {
    const total = amount(f);
    const cur = currency(f);
    const date = dateField(f);
    const description = required(f, "description", "la descripción");
    const paymentMethodId = await requiredMethod(f);
    const n = installmentCount(f);
    const first = str(f, "firstMonth");
    await db.transaction(async (tx) => {
      const [debt] = await createDebtFor(tx, owner.person, description, owner.owed ?? total, cur);
      await tx.insert(s.installmentPlans).values({
        description,
        paymentMethodId,
        totalAmount: total,
        currency: cur,
        installments: n,
        firstMonth: isMonth(first) ? first : addMonths(date.slice(0, 7), 1),
        note: optional(f, "note"),
        otherPerson: owner.person,
        debtId: debt.id,
      });
    });
    return;
  }

  const [saved] = existing
    ? await db.select().from(s.expenses).where(eq(s.expenses.id, existing))
    : [];
  const values = await expenseValues(f, saved);
  const n = installmentCount(f);
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(s.expenses).set({ ...values, installments: n }).where(eq(s.expenses.id, existing));
      if (n > 1) {
        const plan = planValues(f, values, n);
        await tx
          .insert(s.installmentPlans)
          .values({ ...plan, expenseId: existing })
          .onConflictDoUpdate({ target: s.installmentPlans.expenseId, set: plan });
      } else {
        await tx.delete(s.installmentPlans).where(eq(s.installmentPlans.expenseId, existing));
      }
    } else {
      const [created] = await tx.insert(s.expenses).values({ ...values, installments: n }).returning();
      if (n > 1) {
        await tx.insert(s.installmentPlans).values({ ...planValues(f, values, n), expenseId: created.id });
      }
    }
  });
});

export const deleteExpense = action(async (f) => {
  const [deleted] = await db
    .delete(s.expenses)
    .where(eq(s.expenses.id, id(f)))
    .returning({ date: s.expenses.date });
  // Vuelve a la pantalla de origen, si es una ruta interna y no la del gasto recién borrado.
  const returnTo = str(f, "returnTo");
  if (/^\/(?!\/)/.test(returnTo) && !/^\/gastos\/\d/.test(returnTo)) return returnTo;
  return deleted ? `/gastos?mes=${deleted.date.slice(0, 7)}` : "/gastos";
});

// ---------- Cuotas de compras anteriores a la app ----------

export const savePlan = action(async (f) => {
  const firstMonth = str(f, "firstMonth");
  if (!isMonth(firstMonth)) throw new FormError("Elegí el mes de la primera cuota");
  const owner = otherOwner(f);
  const values = {
    description: required(f, "description", "la descripción"),
    paymentMethodId: await requiredMethod(f),
    totalAmount: optionalAmount(f, "totalAmount"),
    installments: installmentCount(f),
    firstMonth,
    note: optional(f, "note"),
    otherPerson: owner?.person ?? null,
  };
  const owed = owner?.owed ?? values.totalAmount;
  if (owner && owed == null) throw new FormError("Para crear la deuda hace falta el monto");

  const planId = str(f, "id") ? id(f) : null;
  const [saved] = planId
    ? await db.select().from(s.installmentPlans).where(eq(s.installmentPlans.id, planId))
    : [];

  await db.transaction(async (tx) => {
    let debtId = saved?.debtId ?? null;
    if (owner) {
      if (debtId) {
        await tx
          .update(s.debts)
          .set({ person: owner.person, concept: values.description, amount: owed! })
          .where(eq(s.debts.id, debtId));
      } else if (!saved?.otherPerson) {
        // Pasó a ser de otra persona. Si ya era y borraste la deuda a mano, no se vuelve a crear.
        const [debt] = await createDebtFor(tx, owner.person, values.description, owed!, saved?.currency ?? "ARS");
        debtId = debt.id;
      }
    } else if (debtId) {
      // Pasó a ser propia: la deuda se va, salvo que ya tenga pagos registrados.
      const payments = await tx.select({ id: s.debtPayments.id }).from(s.debtPayments).where(eq(s.debtPayments.debtId, debtId));
      if (payments.length === 0) await tx.delete(s.debts).where(eq(s.debts.id, debtId));
      debtId = null;
    }

    if (planId) {
      await tx.update(s.installmentPlans).set({ ...values, debtId }).where(eq(s.installmentPlans.id, planId));
    } else {
      await tx.insert(s.installmentPlans).values({ ...values, debtId });
    }
  });
});

export const deletePlan = action(async (f) => {
  const [plan] = await db.select().from(s.installmentPlans).where(eq(s.installmentPlans.id, id(f)));
  if (!plan) return;
  await db.transaction(async (tx) => {
    await tx.delete(s.installmentPlans).where(eq(s.installmentPlans.id, plan.id));
    if (str(f, "alsoDebt") === "1" && plan.debtId) await tx.delete(s.debts).where(eq(s.debts.id, plan.debtId));
  });
});

// ---------- Ingresos ----------

export const saveIncome = action(async (f) => {
  const cents = amount(f);
  const cur = currency(f);
  const date = dateField(f);
  const [saved] = str(f, "id") ? await db.select().from(s.incomes).where(eq(s.incomes.id, id(f))) : [];
  const values = {
    date,
    description: required(f, "description", "de dónde viene el ingreso"),
    // Lo que se carga a mano es variable; lo fijo lo registran los trabajos fijos.
    type: saved?.type ?? ("variable" as const),
    amount: cents,
    currency: cur,
    note: optional(f, "note"),
    ...(await convert(f, cents, cur, date, "compra", saved)),
  };
  if (str(f, "id")) await db.update(s.incomes).set(values).where(eq(s.incomes.id, id(f)));
  else await db.insert(s.incomes).values(values);
});

export const deleteIncome = action(async (f) => {
  await db.delete(s.incomes).where(eq(s.incomes.id, id(f)));
});

// ---------- Trabajos fijos ----------

function payDayField(f: FormData) {
  const day = Number(str(f, "payDay"));
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new FormError("El día de cobro va de 1 a 31");
  return day;
}

export const saveRecurringIncome = action(async (f) => {
  const values = {
    name: required(f, "name", "de dónde viene el ingreso"),
    amount: amount(f),
    currency: currency(f),
    payDay: payDayField(f),
  };
  if (str(f, "id")) {
    // El cambio aplica de acá en adelante: los cobros ya registrados no se tocan.
    await db.update(s.recurringIncomes).set(values).where(eq(s.recurringIncomes.id, id(f)));
    return;
  }
  const firstMonth = str(f, "firstMonth");
  if (!isMonth(firstMonth)) throw new FormError("Elegí desde qué mes cobrás");
  if (firstMonth < addMonths(currentMonth(), -24)) throw new FormError("El primer mes puede ser de hasta 2 años atrás");
  await db.insert(s.recurringIncomes).values({ ...values, nextMonth: firstMonth });
});

export const toggleRecurringIncome = action(async (f) => {
  const [job] = await db.select().from(s.recurringIncomes).where(eq(s.recurringIncomes.id, id(f)));
  if (!job) return;
  // Al reactivar no se cobran los meses en pausa: sigue desde el mes actual.
  const now = currentMonth();
  await db
    .update(s.recurringIncomes)
    .set({
      active: !job.active,
      nextMonth: !job.active && job.nextMonth < now ? now : job.nextMonth,
    })
    .where(eq(s.recurringIncomes.id, job.id));
});

export const deleteRecurringIncome = action(async (f) => {
  await db.delete(s.recurringIncomes).where(eq(s.recurringIncomes.id, id(f)));
});

// ---------- Fijos ----------

export const saveRecurring = action(async (f) => {
  const frequency = str(f, "frequency") === "anual" ? ("anual" as const) : ("mensual" as const);
  const dueDay = str(f, "dueDay") ? Number(str(f, "dueDay")) : null;
  const dueMonth = frequency === "anual" && str(f, "dueMonth") ? Number(str(f, "dueMonth")) : null;
  if (dueDay != null && !(Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31)) {
    throw new FormError("El día de vencimiento va de 1 a 31");
  }
  if (dueMonth != null && !(Number.isInteger(dueMonth) && dueMonth >= 1 && dueMonth <= 12)) {
    throw new FormError("Elegí un mes válido");
  }
  const values = {
    name: required(f, "name", "el nombre"),
    amount: amount(f),
    currency: currency(f),
    categoryId: id(f, "categoryId"),
    paymentMethodId: await requiredMethod(f),
    frequency,
    dueDay,
    dueMonth,
    dueNote: optional(f, "dueNote"),
    createsExpense: str(f, "reminderOnly") !== "on",
  };
  if (str(f, "id")) await db.update(s.recurrings).set(values).where(eq(s.recurrings.id, id(f)));
  else await db.insert(s.recurrings).values(values);
});

export const deleteRecurring = action(async (f) => {
  await db.update(s.recurrings).set({ active: false }).where(eq(s.recurrings.id, id(f)));
});

export const payRecurring = action(async (f) => {
  const recurringId = id(f);
  const period = str(f, "period");
  if (!isMonth(period) && !/^\d{4}$/.test(period)) throw new FormError("Período inválido");
  const cents = amount(f);
  const paidOn = dateField(f);
  const [rec] = await db.select().from(s.recurrings).where(eq(s.recurrings.id, recurringId));
  if (!rec) throw new FormError("No se encontró el fijo");
  const conv = await convert(f, cents, rec.currency, paidOn, "venta");
  // El resumen de tarjeta no genera gasto, así que no necesita elegir medio de pago.
  const paymentMethodId = rec.createsExpense ? await requiredMethod(f) : rec.paymentMethodId;

  await db.transaction(async (tx) => {
    let expenseId: number | null = null;
    if (rec.createsExpense) {
      const [expense] = await tx
        .insert(s.expenses)
        .values({
          date: paidOn,
          description: rec.name,
          categoryId: rec.categoryId,
          paymentMethodId,
          amount: cents,
          currency: rec.currency,
          ...conv,
        })
        .returning();
      expenseId = expense.id;
    }
    await tx.insert(s.recurringPayments).values({ recurringId, period, paidOn, amount: cents, expenseId });
    // Queda como predeterminado para los próximos pagos.
    if (paymentMethodId !== rec.paymentMethodId) {
      await tx.update(s.recurrings).set({ paymentMethodId }).where(eq(s.recurrings.id, recurringId));
    }
  });
});

export const undoRecurringPayment = action(async (f) => {
  const [payment] = await db
    .select()
    .from(s.recurringPayments)
    .where(eq(s.recurringPayments.id, id(f)));
  if (!payment) return;
  await db.transaction(async (tx) => {
    await tx.delete(s.recurringPayments).where(eq(s.recurringPayments.id, payment.id));
    if (payment.expenseId) await tx.delete(s.expenses).where(eq(s.expenses.id, payment.expenseId));
  });
});

// ---------- Deudas ----------

export const saveDebt = action(async (f) => {
  const values = {
    direction: str(f, "direction") === "debo" ? ("debo" as const) : ("me_deben" as const),
    person: required(f, "person", "la persona"),
    concept: optional(f, "concept"),
    amount: amount(f),
    currency: currency(f),
    note: optional(f, "note"),
  };
  if (str(f, "id")) await db.update(s.debts).set(values).where(eq(s.debts.id, id(f)));
  else await db.insert(s.debts).values(values);
});

export const deleteDebt = action(async (f) => {
  await db.delete(s.debts).where(eq(s.debts.id, id(f)));
});

export const addDebtPayment = action(async (f) => {
  await db.insert(s.debtPayments).values({ debtId: id(f), date: dateField(f), amount: amount(f) });
});

export const deleteDebtPayment = action(async (f) => {
  await db.delete(s.debtPayments).where(eq(s.debtPayments.id, id(f)));
});

// ---------- Wishlist ----------

export const saveProject = action(async (f) => {
  const name = required(f, "name", "el nombre");
  if (str(f, "id")) await db.update(s.wishProjects).set({ name }).where(eq(s.wishProjects.id, id(f)));
  else await db.insert(s.wishProjects).values({ name, sortOrder: 99 });
});

export const deleteProject = action(async (f) => {
  await db.delete(s.wishProjects).where(eq(s.wishProjects.id, id(f)));
});

export const saveWishItem = action(async (f) => {
  const link = optional(f, "link");
  if (link && !/^https?:\/\//i.test(link)) throw new FormError("El link tiene que empezar con http:// o https://");
  const rawPriority = str(f, "priority");
  const priority: "alta" | "media" | "baja" =
    rawPriority === "alta" || rawPriority === "baja" ? rawPriority : "media";
  const values = {
    projectId: optionalId(f, "projectId"),
    name: required(f, "name", "el nombre"),
    estimatedPrice: optionalAmount(f, "estimatedPrice"),
    currency: currency(f),
    saved: str(f, "saved") ? (parseMoney(str(f, "saved")) ?? 0) : 0,
    priority,
    link,
    note: optional(f, "note"),
  };
  if (str(f, "id")) await db.update(s.wishItems).set(values).where(eq(s.wishItems.id, id(f)));
  else await db.insert(s.wishItems).values(values);
});

export const deleteWishItem = action(async (f) => {
  await db.delete(s.wishItems).where(eq(s.wishItems.id, id(f)));
  return "/wishlist";
});

export const addWishStep = action(async (f) => {
  await db.insert(s.wishSteps).values({
    itemId: id(f),
    text: required(f, "text", "el paso"),
    sortOrder: Date.now() % 2_000_000_000,
  });
});

export const toggleWishStep = action(async (f) => {
  await db
    .update(s.wishSteps)
    .set({ done: sql`not ${s.wishSteps.done}` })
    .where(eq(s.wishSteps.id, id(f)));
});

export const deleteWishStep = action(async (f) => {
  await db.delete(s.wishSteps).where(eq(s.wishSteps.id, id(f)));
});

/** Marca el deseo como comprado y lo convierte en un gasto real. */
export const purchaseWishItem = action(async (f) => {
  const itemId = id(f);
  const values = await expenseValues(f);
  const n = installmentCount(f);
  await db.transaction(async (tx) => {
    const [expense] = await tx.insert(s.expenses).values({ ...values, installments: n }).returning();
    if (n > 1) {
      await tx.insert(s.installmentPlans).values({ ...planValues(f, values, n), expenseId: expense.id });
    }
    await tx
      .update(s.wishItems)
      .set({ purchasedExpenseId: expense.id, purchasedOn: values.date })
      .where(eq(s.wishItems.id, itemId));
  });
});

// ---------- Ajustes ----------

export const saveCategory = action(async (f) => {
  const values = { name: required(f, "name", "el nombre") };
  try {
    if (str(f, "id")) await db.update(s.categories).set(values).where(eq(s.categories.id, id(f)));
    else await db.insert(s.categories).values({ ...values, sortOrder: 99 });
  } catch {
    throw new FormError("Ya existe una categoría con ese nombre");
  }
});

export const toggleCategoryArchived = action(async (f) => {
  await db
    .update(s.categories)
    .set({ archived: sql`not ${s.categories.archived}` })
    .where(eq(s.categories.id, id(f)));
});

export const saveMethod = action(async (f) => {
  const type = str(f, "type");
  if (type !== "efectivo" && type !== "debito" && type !== "transferencia" && type !== "credito") {
    throw new FormError("Elegí un tipo");
  }
  const values = { name: required(f, "name", "el nombre"), type: type as typeof s.paymentMethods.$inferInsert.type };
  try {
    if (str(f, "id")) await db.update(s.paymentMethods).set(values).where(eq(s.paymentMethods.id, id(f)));
    else await db.insert(s.paymentMethods).values(values);
  } catch {
    throw new FormError("Ya existe un medio de pago con ese nombre");
  }
});

export const saveDollarType = action(async (f) => {
  const type = str(f, "dollarType");
  if (!isDollarType(type)) throw new FormError("Elegí un tipo de dólar");
  await db
    .insert(s.settings)
    .values({ key: "dollar_type", value: type })
    .onConflictDoUpdate({ target: s.settings.key, set: { value: type } });
});

export const toggleMethodArchived = action(async (f) => {
  await db
    .update(s.paymentMethods)
    .set({ archived: sql`not ${s.paymentMethods.archived}` })
    .where(eq(s.paymentMethods.id, id(f)));
});
