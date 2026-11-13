import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Todos los montos se guardan en centavos (enteros) para evitar errores de redondeo.
const money = (name: string) => bigint(name, { mode: "number" });

// Cada fila pertenece a un usuario y se borra con su cuenta.
const owner = () =>
  integer("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" });

export const categories = pgTable(
  "categories",
  {
    id: serial().primaryKey(),
    userId: owner(),
    name: text().notNull(),
    monthlyBudget: money("monthly_budget"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean().notNull().default(false),
  },
  (t) => [unique("categories_user_name_unique").on(t.userId, t.name)],
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: serial().primaryKey(),
    userId: owner(),
    name: text().notNull(),
    type: text().notNull().$type<"efectivo" | "debito" | "transferencia" | "credito">(),
    archived: boolean().notNull().default(false),
  },
  (t) => [unique("payment_methods_user_name_unique").on(t.userId, t.name)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial().primaryKey(),
    userId: owner(),
    date: date().notNull(),
    description: text().notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    paymentMethodId: integer("payment_method_id").references(() => paymentMethods.id),
    amount: money("amount").notNull(),
    currency: text().notNull().default("ARS").$type<Currency>(),
    rate: numeric({ precision: 14, scale: 4 }),
    amountArs: money("amount_ars").notNull(),
    installments: integer().notNull().default(1),
    note: text(),
    source: text().notNull().default("manual").$type<"manual" | "excel">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_user_date_idx").on(t.userId, t.date)],
);

// Un plan puede venir de una compra cargada acá (expenseId) o ser una compra
// anterior a la app: en ese caso no suma como gasto, solo como compromiso futuro.
export const installmentPlans = pgTable(
  "installment_plans",
  {
    id: serial().primaryKey(),
    userId: owner(),
    expenseId: integer("expense_id")
      .unique()
      .references(() => expenses.id, { onDelete: "cascade" }),
    description: text().notNull(),
    paymentMethodId: integer("payment_method_id").references(() => paymentMethods.id),
    totalAmount: money("total_amount"),
    currency: text().notNull().default("ARS").$type<Currency>(),
    installments: integer().notNull(),
    firstMonth: text("first_month").notNull(),
    note: text(),
    // Si la compra es de otra persona: usa tu tarjeta, no suma a tus gastos y genera una deuda.
    otherPerson: text("other_person"),
    debtId: integer("debt_id").references((): AnyPgColumn => debts.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("installment_plans_user_idx").on(t.userId)],
);

// Trabajo fijo: genera un ingreso por mes. `nextMonth` es el próximo mes a registrar.
export const recurringIncomes = pgTable(
  "recurring_incomes",
  {
    id: serial().primaryKey(),
    userId: owner(),
    name: text().notNull(),
    amount: money("amount").notNull(),
    currency: text().notNull().default("ARS").$type<Currency>(),
    payDay: integer("pay_day").notNull(),
    nextMonth: text("next_month").notNull(),
    active: boolean().notNull().default(true),
  },
  (t) => [index("recurring_incomes_user_idx").on(t.userId)],
);

export const incomes = pgTable(
  "incomes",
  {
    id: serial().primaryKey(),
    userId: owner(),
    date: date().notNull(),
    description: text().notNull(),
    type: text().notNull().$type<"fijo" | "variable">(),
    amount: money("amount").notNull(),
    currency: text().notNull().default("ARS").$type<Currency>(),
    rate: numeric({ precision: 14, scale: 4 }),
    amountArs: money("amount_ars").notNull(),
    note: text(),
    recurringIncomeId: integer("recurring_income_id").references(() => recurringIncomes.id, {
      onDelete: "set null",
    }),
    period: text(), // YYYY-MM del cobro automático; null si se cargó a mano
  },
  (t) => [index("incomes_user_date_idx").on(t.userId, t.date), unique().on(t.recurringIncomeId, t.period)],
);

export const recurrings = pgTable(
  "recurrings",
  {
    id: serial().primaryKey(),
    userId: owner(),
    name: text().notNull(),
    amount: money("amount").notNull(),
    currency: text().notNull().default("ARS").$type<Currency>(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    paymentMethodId: integer("payment_method_id").references(() => paymentMethods.id),
    frequency: text().notNull().$type<"mensual" | "anual">(),
    dueDay: integer("due_day"),
    dueMonth: integer("due_month"),
    dueNote: text("due_note"),
    // false para el resumen de tarjeta: las compras ya se cargaron una por una,
    // así que pagar el resumen es un recordatorio y no suma como gasto.
    createsExpense: boolean("creates_expense").notNull().default(true),
    active: boolean().notNull().default(true),
  },
  (t) => [index("recurrings_user_idx").on(t.userId)],
);

export const recurringPayments = pgTable(
  "recurring_payments",
  {
    id: serial().primaryKey(),
    userId: owner(),
    recurringId: integer("recurring_id")
      .notNull()
      .references(() => recurrings.id, { onDelete: "cascade" }),
    period: text().notNull(), // YYYY-MM o YYYY según la frecuencia
    paidOn: date("paid_on").notNull(),
    amount: money("amount").notNull(),
    expenseId: integer("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
  },
  (t) => [unique().on(t.recurringId, t.period), index("recurring_payments_user_idx").on(t.userId)],
);

export const debts = pgTable(
  "debts",
  {
    id: serial().primaryKey(),
    userId: owner(),
    direction: text().notNull().$type<"debo" | "me_deben">(),
    person: text().notNull(),
    concept: text(),
    amount: money("amount").notNull(),
    currency: text().notNull().default("ARS").$type<Currency>(),
    note: text(),
  },
  (t) => [index("debts_user_idx").on(t.userId)],
);

export const debtPayments = pgTable(
  "debt_payments",
  {
    id: serial().primaryKey(),
    userId: owner(),
    debtId: integer("debt_id")
      .notNull()
      .references(() => debts.id, { onDelete: "cascade" }),
    date: date().notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [index("debt_payments_user_idx").on(t.userId)],
);

export const wishProjects = pgTable(
  "wish_projects",
  {
    id: serial().primaryKey(),
    userId: owner(),
    name: text().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("wish_projects_user_idx").on(t.userId)],
);

export const wishItems = pgTable(
  "wish_items",
  {
    id: serial().primaryKey(),
    userId: owner(),
    projectId: integer("project_id").references(() => wishProjects.id, {
      onDelete: "set null",
    }),
    name: text().notNull(),
    estimatedPrice: money("estimated_price"),
    currency: text().notNull().default("ARS").$type<Currency>(),
    saved: money("saved").notNull().default(0),
    priority: text().notNull().default("media").$type<"alta" | "media" | "baja">(),
    link: text(),
    note: text(),
    purchasedExpenseId: integer("purchased_expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    purchasedOn: date("purchased_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wish_items_user_idx").on(t.userId)],
);

export const wishSteps = pgTable(
  "wish_steps",
  {
    id: serial().primaryKey(),
    userId: owner(),
    itemId: integer("item_id")
      .notNull()
      .references(() => wishItems.id, { onDelete: "cascade" }),
    text: text().notNull(),
    done: boolean().notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("wish_steps_user_idx").on(t.userId)],
);

export const settings = pgTable(
  "settings",
  {
    userId: owner(),
    key: text().notNull(),
    value: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const users = pgTable("users", {
  id: serial().primaryKey(),
  // Siempre en minúsculas, para que "Ana@" y "ana@" sean la misma cuenta.
  email: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Las sesiones anteriores a este momento dejan de valer (al cambiar la contraseña).
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResets = pgTable("password_resets", {
  id: serial().primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Se guarda el hash del token, nunca el token: el link solo existe en el mail.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** Intentos de login, registro y recuperación, para limitar abusos por email o por IP. */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: serial().primaryKey(),
    kind: text().notNull(),
    key: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_attempts_lookup_idx").on(t.kind, t.key, t.at)],
);

export type Currency = "ARS" | "USD";
