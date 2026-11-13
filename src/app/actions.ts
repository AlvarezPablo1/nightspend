"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Currency } from "@/db/schema";
import { currentSession, currentUserId } from "@/lib/auth";
import { createStarterData } from "@/lib/starter-data";
import { createGuest, destroyGuest, GuestLimitError, guestModeEnabled } from "@/lib/guest";
import { isDollarType, lookupRate, type RateSide } from "@/lib/dollar";
import { addMonths, currentMonth, isDate, isMonth, parseMoney, today } from "@/lib/format";
import { sendMail } from "@/lib/mail";
import { claimOwnerData, isUnclaimedOwnerEmail } from "@/lib/owner-claim";
import { hashPassword, normalizeEmail, passwordProblem, verifyAgainstNothing, verifyPassword } from "@/lib/password";
import { clearAttempts, clientIp, isLimited, recordAttempt } from "@/lib/rate-limit";
import {
  GUEST_SESSION_HOURS,
  SESSION_COOKIE,
  SESSION_DAYS,
  signGuestSession,
  signUserSession,
} from "@/lib/session";

export type ActionResult = { error?: string; ok?: boolean } | void;

class FormError extends Error {}

/**
 * Envuelve una acción: exige sesión, le pasa el usuario dueño de los datos, traduce
 * errores, refresca la UI y redirige si la acción devuelve una ruta.
 */
function action(fn: (form: FormData, userId: number) => Promise<string | void>) {
  return async (form: FormData): Promise<ActionResult> => {
    const userId = await currentUserId();
    let destination: string | void;
    try {
      destination = await fn(form, userId);
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

type OwnedTable =
  | typeof s.categories
  | typeof s.paymentMethods
  | typeof s.expenses
  | typeof s.installmentPlans
  | typeof s.recurringIncomes
  | typeof s.incomes
  | typeof s.recurrings
  | typeof s.recurringPayments
  | typeof s.debts
  | typeof s.debtPayments
  | typeof s.wishProjects
  | typeof s.wishItems
  | typeof s.wishSteps;

/** Condición para tocar una fila por id: además tiene que ser del usuario. */
const mine = (table: OwnedTable, rowId: number, userId: number) =>
  and(eq(table.id, rowId), eq(table.userId, userId));

/**
 * Un id que llega del formulario y apunta a otra tabla (categoría, deuda, proyecto…)
 * tiene que ser del mismo usuario: si no, se rechaza como si no existiera.
 */
async function ownedRef(table: OwnedTable, rowId: number, userId: number, message: string) {
  const [row] = await db.select({ id: table.id }).from(table as typeof s.categories).where(mine(table, rowId, userId));
  if (!row) throw new FormError(message);
  return rowId;
}

async function requiredMethod(f: FormData, userId: number) {
  const methodId = optionalId(f, "paymentMethodId");
  if (!methodId) throw new FormError("Elegí el medio de pago");
  return ownedRef(s.paymentMethods, methodId, userId, "Elegí el medio de pago");
}

const requiredCategory = (f: FormData, userId: number) =>
  ownedRef(s.categories, id(f, "categoryId"), userId, "Elegí la categoría");

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
  userId: number,
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
    rate = (await lookupRate(userId, date, side))?.rate ?? null;
    if (!rate) throw new FormError("No pude obtener la cotización. Tocá \"Usar otra cotización\" y cargala a mano.");
  }
  return { rate: String(rate), amountArs: Math.round(cents * rate) };
}

// ---------- Sesión ----------

// La contraseña no se recorta: los espacios son parte de ella.
const password = (f: FormData, k = "password") => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

const TOO_MANY = "Demasiados intentos. Probá de nuevo en un rato.";
const RESET_HOURS = 1;

export async function login(form: FormData): Promise<ActionResult> {
  const email = normalizeEmail(str(form, "email"));
  const ip = await clientIp();
  if (!email) return { error: "Revisá el email" };
  if ((await isLimited("login-email", email)) || (await isLimited("login-ip", ip))) return { error: TOO_MANY };

  const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (!user) {
    // El dueño de antes de los usuarios entra con su contraseña de siempre y recupera sus datos.
    const claimedId = await claimOwnerData(email, password(form));
    if (claimedId) {
      await setSessionCookie(await signUserSession(claimedId), SESSION_DAYS * 86_400);
      redirect("/");
    }
  }
  const valid = user
    ? await verifyPassword(password(form), user.passwordHash)
    : await verifyAgainstNothing(password(form));
  if (!user || !valid) {
    await recordAttempt("login-email", email);
    await recordAttempt("login-ip", ip);
    // El mismo mensaje en los dos casos, para no revelar qué emails tienen cuenta.
    return { error: "Email o contraseña incorrectos" };
  }
  await clearAttempts("login-email", email);
  await setSessionCookie(await signUserSession(user.id), SESSION_DAYS * 86_400);
  redirect("/");
}

export async function register(form: FormData): Promise<ActionResult> {
  const email = normalizeEmail(str(form, "email"));
  if (!email) return { error: "Revisá el email" };
  const problem = passwordProblem(password(form));
  if (problem) return { error: problem };
  const ip = await clientIp();
  if (await isLimited("register-ip", ip)) return { error: TOO_MANY };
  if (await isUnclaimedOwnerEmail(email)) return { error: "Ya hay una cuenta con ese email. Entrá con tu contraseña." };

  const passwordHash = await hashPassword(password(form));
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(s.users)
      .values({ email, passwordHash })
      .onConflictDoNothing({ target: s.users.email })
      .returning({ id: s.users.id });
    if (created) await createStarterData(tx, created.id);
    return created;
  });
  if (!user) return { error: "Ya hay una cuenta con ese email. Entrá o recuperá tu contraseña." };
  await recordAttempt("register-ip", ip);
  await setSessionCookie(await signUserSession(user.id), SESSION_DAYS * 86_400);
  redirect("/");
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("base64url");

async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** Siempre termina igual, exista o no la cuenta, para no revelar qué emails están registrados. */
export async function requestPasswordReset(form: FormData): Promise<ActionResult> {
  const email = normalizeEmail(str(form, "email"));
  if (!email) return { error: "Revisá el email" };
  const ip = await clientIp();
  if ((await isLimited("reset-email", email)) || (await isLimited("reset-ip", ip))) return { error: TOO_MANY };
  await recordAttempt("reset-email", email);
  await recordAttempt("reset-ip", ip);

  const [user] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (user) {
    const token = randomBytes(32).toString("base64url");
    // Un link nuevo anula los anteriores que no se usaron.
    await db.delete(s.passwordResets).where(eq(s.passwordResets.userId, user.id));
    await db.insert(s.passwordResets).values({
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000),
    });
    const link = `${await appUrl()}/restablecer?token=${token}`;
    const sent = await sendMail({
      to: email,
      subject: "Recuperar tu contraseña · Nightspend",
      text: `Para elegir una contraseña nueva, entrá a este link:\n\n${link}\n\nVence en ${RESET_HOURS} hora. Si no lo pediste, ignorá este mail: tu contraseña no cambia.`,
    });
    // Sin Resend configurado (en tu compu) el link se muestra en la consola del servidor.
    if (!sent.ok && sent.reason === "sin-configurar" && process.env.NODE_ENV !== "production") {
      console.info(`Link para recuperar la contraseña de ${email}: ${link}`);
    }
  }
  redirect("/recuperar?enviado=1");
}

export async function resetPassword(form: FormData): Promise<ActionResult> {
  const problem = passwordProblem(password(form));
  if (problem) return { error: problem };
  const [reset] = await db
    .select()
    .from(s.passwordResets)
    .where(
      and(
        eq(s.passwordResets.tokenHash, tokenHash(str(form, "token"))),
        isNull(s.passwordResets.usedAt),
        gt(s.passwordResets.expiresAt, new Date()),
      ),
    );
  if (!reset) return { error: "El link venció o ya se usó. Pedí uno nuevo." };

  const user = await db.transaction(async (tx) => {
    // Se marca como usado solo si nadie lo usó en el medio: un link sirve una sola vez.
    const used = await tx
      .update(s.passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(s.passwordResets.id, reset.id), isNull(s.passwordResets.usedAt)))
      .returning({ id: s.passwordResets.id });
    if (used.length === 0) return null;
    const [updated] = await tx
      .update(s.users)
      .set({ passwordHash: await hashPassword(password(form)), passwordChangedAt: new Date() })
      .where(eq(s.users.id, reset.userId))
      .returning({ id: s.users.id, email: s.users.email });
    return updated ?? null;
  });
  if (!user) return { error: "El link venció o ya se usó. Pedí uno nuevo." };

  await clearAttempts("login-email", user.email);
  // Las demás sesiones abiertas quedan cerradas, porque son anteriores al cambio.
  await setSessionCookie(await signUserSession(user.id), SESSION_DAYS * 86_400);
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

async function expenseValues(f: FormData, userId: number, saved?: SavedRate) {
  const cents = amount(f);
  const cur = currency(f);
  const date = dateField(f);
  return {
    date,
    description: required(f, "description", "la descripción"),
    categoryId: await requiredCategory(f, userId),
    paymentMethodId: await requiredMethod(f, userId),
    amount: cents,
    currency: cur,
    note: optional(f, "note"),
    ...(await convert(f, userId, cents, cur, date, "venta", saved)),
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

function createDebtFor(tx: DbOrTx, userId: number, person: string, concept: string, owed: number, cur: Currency) {
  return tx
    .insert(s.debts)
    .values({ userId, direction: "me_deben", person, concept, amount: owed, currency: cur })
    .returning({ id: s.debts.id });
}

export const saveExpense = action(async (f, userId) => {
  const existing = str(f, "id") ? id(f) : null;

  // Compra para otra persona: no es un gasto propio, solo cuotas por pagar y una deuda a favor.
  const owner = existing ? null : otherOwner(f);
  if (owner) {
    const total = amount(f);
    const cur = currency(f);
    const date = dateField(f);
    const description = required(f, "description", "la descripción");
    const paymentMethodId = await requiredMethod(f, userId);
    const n = installmentCount(f);
    const first = str(f, "firstMonth");
    await db.transaction(async (tx) => {
      const [debt] = await createDebtFor(tx, userId, owner.person, description, owner.owed ?? total, cur);
      await tx.insert(s.installmentPlans).values({
        userId,
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

  const [saved] = existing ? await db.select().from(s.expenses).where(mine(s.expenses, existing, userId)) : [];
  if (existing && !saved) throw new FormError("No se encontró el gasto");
  const values = await expenseValues(f, userId, saved);
  const n = installmentCount(f);
  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(s.expenses)
        .set({ ...values, installments: n })
        .where(mine(s.expenses, existing, userId));
      if (n > 1) {
        // El gasto ya se comprobó que es del usuario, así que su plan también.
        const plan = planValues(f, values, n);
        await tx
          .insert(s.installmentPlans)
          .values({ ...plan, userId, expenseId: existing })
          .onConflictDoUpdate({ target: s.installmentPlans.expenseId, set: plan });
      } else {
        await tx
          .delete(s.installmentPlans)
          .where(and(eq(s.installmentPlans.expenseId, existing), eq(s.installmentPlans.userId, userId)));
      }
    } else {
      const [created] = await tx
        .insert(s.expenses)
        .values({ ...values, userId, installments: n })
        .returning();
      if (n > 1) {
        await tx.insert(s.installmentPlans).values({ ...planValues(f, values, n), userId, expenseId: created.id });
      }
    }
  });
});

export const deleteExpense = action(async (f, userId) => {
  const [deleted] = await db
    .delete(s.expenses)
    .where(mine(s.expenses, id(f), userId))
    .returning({ date: s.expenses.date });
  // Vuelve a la pantalla de origen, si es una ruta interna y no la del gasto recién borrado.
  const returnTo = str(f, "returnTo");
  if (/^\/(?!\/)/.test(returnTo) && !/^\/gastos\/\d/.test(returnTo)) return returnTo;
  return deleted ? `/gastos?mes=${deleted.date.slice(0, 7)}` : "/gastos";
});

// ---------- Cuotas de compras anteriores a la app ----------

export const savePlan = action(async (f, userId) => {
  const firstMonth = str(f, "firstMonth");
  if (!isMonth(firstMonth)) throw new FormError("Elegí el mes de la primera cuota");
  const owner = otherOwner(f);
  const values = {
    description: required(f, "description", "la descripción"),
    paymentMethodId: await requiredMethod(f, userId),
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
    ? await db.select().from(s.installmentPlans).where(mine(s.installmentPlans, planId, userId))
    : [];
  if (planId && !saved) throw new FormError("No se encontró la compra en cuotas");

  await db.transaction(async (tx) => {
    let debtId = saved?.debtId ?? null;
    if (owner) {
      if (debtId) {
        await tx
          .update(s.debts)
          .set({ person: owner.person, concept: values.description, amount: owed! })
          .where(mine(s.debts, debtId, userId));
      } else if (!saved?.otherPerson) {
        // Pasó a ser de otra persona. Si ya era y borraste la deuda a mano, no se vuelve a crear.
        const [debt] = await createDebtFor(
          tx,
          userId,
          owner.person,
          values.description,
          owed!,
          saved?.currency ?? "ARS",
        );
        debtId = debt.id;
      }
    } else if (debtId) {
      // Pasó a ser propia: la deuda se va, salvo que ya tenga pagos registrados.
      const payments = await tx
        .select({ id: s.debtPayments.id })
        .from(s.debtPayments)
        .where(and(eq(s.debtPayments.debtId, debtId), eq(s.debtPayments.userId, userId)));
      if (payments.length === 0) await tx.delete(s.debts).where(mine(s.debts, debtId, userId));
      debtId = null;
    }

    if (planId) {
      await tx
        .update(s.installmentPlans)
        .set({ ...values, debtId })
        .where(mine(s.installmentPlans, planId, userId));
    } else {
      await tx.insert(s.installmentPlans).values({ ...values, userId, debtId });
    }
  });
});

export const deletePlan = action(async (f, userId) => {
  const [plan] = await db.select().from(s.installmentPlans).where(mine(s.installmentPlans, id(f), userId));
  if (!plan) return;
  await db.transaction(async (tx) => {
    await tx.delete(s.installmentPlans).where(mine(s.installmentPlans, plan.id, userId));
    if (str(f, "alsoDebt") === "1" && plan.debtId) {
      await tx.delete(s.debts).where(mine(s.debts, plan.debtId, userId));
    }
  });
});

// ---------- Ingresos ----------

export const saveIncome = action(async (f, userId) => {
  const cents = amount(f);
  const cur = currency(f);
  const date = dateField(f);
  const incomeId = str(f, "id") ? id(f) : null;
  const [saved] = incomeId ? await db.select().from(s.incomes).where(mine(s.incomes, incomeId, userId)) : [];
  if (incomeId && !saved) throw new FormError("No se encontró el ingreso");
  const values = {
    date,
    description: required(f, "description", "de dónde viene el ingreso"),
    // Lo que se carga a mano es variable; lo fijo lo registran los trabajos fijos.
    type: saved?.type ?? ("variable" as const),
    amount: cents,
    currency: cur,
    note: optional(f, "note"),
    ...(await convert(f, userId, cents, cur, date, "compra", saved)),
  };
  if (incomeId) await db.update(s.incomes).set(values).where(mine(s.incomes, incomeId, userId));
  else await db.insert(s.incomes).values({ ...values, userId });
});

export const deleteIncome = action(async (f, userId) => {
  await db.delete(s.incomes).where(mine(s.incomes, id(f), userId));
});

// ---------- Trabajos fijos ----------

function payDayField(f: FormData) {
  const day = Number(str(f, "payDay"));
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new FormError("El día de cobro va de 1 a 31");
  return day;
}

export const saveRecurringIncome = action(async (f, userId) => {
  const values = {
    name: required(f, "name", "de dónde viene el ingreso"),
    amount: amount(f),
    currency: currency(f),
    payDay: payDayField(f),
  };
  if (str(f, "id")) {
    // El cambio aplica de acá en adelante: los cobros ya registrados no se tocan.
    await db
      .update(s.recurringIncomes)
      .set(values)
      .where(mine(s.recurringIncomes, id(f), userId));
    return;
  }
  const firstMonth = str(f, "firstMonth");
  if (!isMonth(firstMonth)) throw new FormError("Elegí desde qué mes cobrás");
  if (firstMonth < addMonths(currentMonth(), -24)) throw new FormError("El primer mes puede ser de hasta 2 años atrás");
  await db.insert(s.recurringIncomes).values({ ...values, userId, nextMonth: firstMonth });
});

export const toggleRecurringIncome = action(async (f, userId) => {
  const [job] = await db.select().from(s.recurringIncomes).where(mine(s.recurringIncomes, id(f), userId));
  if (!job) return;
  // Al reactivar no se cobran los meses en pausa: sigue desde el mes actual.
  const now = currentMonth();
  await db
    .update(s.recurringIncomes)
    .set({
      active: !job.active,
      nextMonth: !job.active && job.nextMonth < now ? now : job.nextMonth,
    })
    .where(mine(s.recurringIncomes, job.id, userId));
});

export const deleteRecurringIncome = action(async (f, userId) => {
  await db.delete(s.recurringIncomes).where(mine(s.recurringIncomes, id(f), userId));
});

// ---------- Fijos ----------

export const saveRecurring = action(async (f, userId) => {
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
    categoryId: await requiredCategory(f, userId),
    paymentMethodId: await requiredMethod(f, userId),
    frequency,
    dueDay,
    dueMonth,
    dueNote: optional(f, "dueNote"),
    createsExpense: str(f, "reminderOnly") !== "on",
  };
  if (str(f, "id")) await db.update(s.recurrings).set(values).where(mine(s.recurrings, id(f), userId));
  else await db.insert(s.recurrings).values({ ...values, userId });
});

export const deleteRecurring = action(async (f, userId) => {
  await db
    .update(s.recurrings)
    .set({ active: false })
    .where(mine(s.recurrings, id(f), userId));
});

export const payRecurring = action(async (f, userId) => {
  const recurringId = id(f);
  const period = str(f, "period");
  if (!isMonth(period) && !/^\d{4}$/.test(period)) throw new FormError("Período inválido");
  const cents = amount(f);
  const paidOn = dateField(f);
  const [rec] = await db.select().from(s.recurrings).where(mine(s.recurrings, recurringId, userId));
  if (!rec) throw new FormError("No se encontró el fijo");
  const conv = await convert(f, userId, cents, rec.currency, paidOn, "venta");
  // El resumen de tarjeta no genera gasto, así que no necesita elegir medio de pago.
  const paymentMethodId = rec.createsExpense ? await requiredMethod(f, userId) : rec.paymentMethodId;

  await db.transaction(async (tx) => {
    let expenseId: number | null = null;
    if (rec.createsExpense) {
      const [expense] = await tx
        .insert(s.expenses)
        .values({
          userId,
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
    await tx.insert(s.recurringPayments).values({ userId, recurringId, period, paidOn, amount: cents, expenseId });
    // Queda como predeterminado para los próximos pagos.
    if (paymentMethodId !== rec.paymentMethodId) {
      await tx
        .update(s.recurrings)
        .set({ paymentMethodId })
        .where(mine(s.recurrings, recurringId, userId));
    }
  });
});

export const undoRecurringPayment = action(async (f, userId) => {
  const [payment] = await db
    .select()
    .from(s.recurringPayments)
    .where(mine(s.recurringPayments, id(f), userId));
  if (!payment) return;
  await db.transaction(async (tx) => {
    await tx.delete(s.recurringPayments).where(mine(s.recurringPayments, payment.id, userId));
    if (payment.expenseId) await tx.delete(s.expenses).where(mine(s.expenses, payment.expenseId, userId));
  });
});

// ---------- Deudas ----------

export const saveDebt = action(async (f, userId) => {
  const values = {
    direction: str(f, "direction") === "debo" ? ("debo" as const) : ("me_deben" as const),
    person: required(f, "person", "la persona"),
    concept: optional(f, "concept"),
    amount: amount(f),
    currency: currency(f),
    note: optional(f, "note"),
  };
  if (str(f, "id")) await db.update(s.debts).set(values).where(mine(s.debts, id(f), userId));
  else await db.insert(s.debts).values({ ...values, userId });
});

export const deleteDebt = action(async (f, userId) => {
  await db.delete(s.debts).where(mine(s.debts, id(f), userId));
});

export const addDebtPayment = action(async (f, userId) => {
  const debtId = await ownedRef(s.debts, id(f), userId, "No se encontró la deuda");
  await db.insert(s.debtPayments).values({ userId, debtId, date: dateField(f), amount: amount(f) });
});

export const deleteDebtPayment = action(async (f, userId) => {
  await db.delete(s.debtPayments).where(mine(s.debtPayments, id(f), userId));
});

// ---------- Wishlist ----------

export const saveProject = action(async (f, userId) => {
  const name = required(f, "name", "el nombre");
  if (str(f, "id")) await db.update(s.wishProjects).set({ name }).where(mine(s.wishProjects, id(f), userId));
  else await db.insert(s.wishProjects).values({ userId, name, sortOrder: 99 });
});

export const deleteProject = action(async (f, userId) => {
  await db.delete(s.wishProjects).where(mine(s.wishProjects, id(f), userId));
});

export const saveWishItem = action(async (f, userId) => {
  const link = optional(f, "link");
  if (link && !/^https?:\/\//i.test(link)) throw new FormError("El link tiene que empezar con http:// o https://");
  const rawPriority = str(f, "priority");
  const priority: "alta" | "media" | "baja" =
    rawPriority === "alta" || rawPriority === "baja" ? rawPriority : "media";
  const projectId = optionalId(f, "projectId");
  const values = {
    projectId: projectId && (await ownedRef(s.wishProjects, projectId, userId, "Elegí un proyecto válido")),
    name: required(f, "name", "el nombre"),
    estimatedPrice: optionalAmount(f, "estimatedPrice"),
    currency: currency(f),
    saved: str(f, "saved") ? (parseMoney(str(f, "saved")) ?? 0) : 0,
    priority,
    link,
    note: optional(f, "note"),
  };
  if (str(f, "id")) await db.update(s.wishItems).set(values).where(mine(s.wishItems, id(f), userId));
  else await db.insert(s.wishItems).values({ ...values, userId });
});

export const deleteWishItem = action(async (f, userId) => {
  await db.delete(s.wishItems).where(mine(s.wishItems, id(f), userId));
  return "/wishlist";
});

export const addWishStep = action(async (f, userId) => {
  await db.insert(s.wishSteps).values({
    userId,
    itemId: await ownedRef(s.wishItems, id(f), userId, "No se encontró el deseo"),
    text: required(f, "text", "el paso"),
    sortOrder: Date.now() % 2_000_000_000,
  });
});

export const toggleWishStep = action(async (f, userId) => {
  await db
    .update(s.wishSteps)
    .set({ done: sql`not ${s.wishSteps.done}` })
    .where(mine(s.wishSteps, id(f), userId));
});

export const deleteWishStep = action(async (f, userId) => {
  await db.delete(s.wishSteps).where(mine(s.wishSteps, id(f), userId));
});

/** Marca el deseo como comprado y lo convierte en un gasto real. */
export const purchaseWishItem = action(async (f, userId) => {
  const itemId = await ownedRef(s.wishItems, id(f), userId, "No se encontró el deseo");
  const values = await expenseValues(f, userId);
  const n = installmentCount(f);
  await db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(s.expenses)
      .values({ ...values, userId, installments: n })
      .returning();
    if (n > 1) {
      await tx.insert(s.installmentPlans).values({ ...planValues(f, values, n), userId, expenseId: expense.id });
    }
    await tx
      .update(s.wishItems)
      .set({ purchasedExpenseId: expense.id, purchasedOn: values.date })
      .where(mine(s.wishItems, itemId, userId));
  });
});

// ---------- Ajustes ----------

export const saveCategory = action(async (f, userId) => {
  const values = { name: required(f, "name", "el nombre") };
  try {
    if (str(f, "id")) await db.update(s.categories).set(values).where(mine(s.categories, id(f), userId));
    else await db.insert(s.categories).values({ ...values, userId, sortOrder: 99 });
  } catch {
    throw new FormError("Ya existe una categoría con ese nombre");
  }
});

export const toggleCategoryArchived = action(async (f, userId) => {
  await db
    .update(s.categories)
    .set({ archived: sql`not ${s.categories.archived}` })
    .where(mine(s.categories, id(f), userId));
});

export const saveMethod = action(async (f, userId) => {
  const type = str(f, "type");
  if (type !== "efectivo" && type !== "debito" && type !== "transferencia" && type !== "credito") {
    throw new FormError("Elegí un tipo");
  }
  const values = { name: required(f, "name", "el nombre"), type: type as typeof s.paymentMethods.$inferInsert.type };
  try {
    if (str(f, "id")) await db.update(s.paymentMethods).set(values).where(mine(s.paymentMethods, id(f), userId));
    else await db.insert(s.paymentMethods).values({ ...values, userId });
  } catch {
    throw new FormError("Ya existe un medio de pago con ese nombre");
  }
});

export const saveDollarType = action(async (f, userId) => {
  const type = str(f, "dollarType");
  if (!isDollarType(type)) throw new FormError("Elegí un tipo de dólar");
  await db
    .insert(s.settings)
    .values({ userId, key: "dollar_type", value: type })
    .onConflictDoUpdate({ target: [s.settings.userId, s.settings.key], set: { value: type } });
});

export const toggleMethodArchived = action(async (f, userId) => {
  await db
    .update(s.paymentMethods)
    .set({ archived: sql`not ${s.paymentMethods.archived}` })
    .where(mine(s.paymentMethods, id(f), userId));
});
