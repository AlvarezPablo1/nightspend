import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { guestPool } from "@/db/guest-pools";
import * as s from "@/db/schema";
import { addMonths, currentMonth, daysInMonth, today } from "./format";
import { GUEST_USER_ID } from "./session";

/** Datos 100 % ficticios para los invitados. Las fechas se calculan a partir de hoy. */
const CATEGORIES = [
  "Mercadería", "Cuentas", "Transporte", "Salidas", "Personal",
  "Mascotas", "Salud", "Hogar", "Transferencias", "Otros",
];

const METHODS = [
  { name: "Efectivo", type: "efectivo" as const },
  { name: "Débito", type: "debito" as const },
  { name: "Transferencia", type: "transferencia" as const },
  { name: "Tarjeta Visa", type: "credito" as const },
  { name: "Tarjeta Master", type: "credito" as const },
];

const VARIABLE_EXPENSES = [
  { category: "Mercadería", method: "Débito", names: ["Supermercado", "Verdulería", "Carnicería", "Almacén", "Panadería"], min: 6_000, max: 85_000, perMonth: 9 },
  { category: "Salidas", method: "Tarjeta Visa", names: ["Cena con amigos", "Cine", "Cafetería", "Delivery"], min: 8_000, max: 45_000, perMonth: 5 },
  { category: "Transporte", method: "Débito", names: ["Nafta", "Carga de SUBE", "Uber", "Estacionamiento"], min: 3_000, max: 45_000, perMonth: 5 },
  { category: "Personal", method: "Tarjeta Master", names: ["Ropa", "Libro", "Peluquería"], min: 12_000, max: 70_000, perMonth: 2 },
  { category: "Mascotas", method: "Efectivo", names: ["Alimento para el perro", "Veterinaria"], min: 15_000, max: 60_000, perMonth: 1 },
  { category: "Salud", method: "Débito", names: ["Farmacia", "Consulta médica"], min: 8_000, max: 40_000, perMonth: 1 },
  { category: "Hogar", method: "Tarjeta Visa", names: ["Ferretería", "Artículos de limpieza"], min: 6_000, max: 35_000, perMonth: 1 },
  { category: "Otros", method: "Efectivo", names: ["Regalo de cumpleaños", "Varios"], min: 5_000, max: 30_000, perMonth: 1 },
];

const MONTHLY_BILLS = [
  { name: "Alquiler", amount: 420_000, day: 5, method: "Transferencia" },
  { name: "Luz", amount: 48_000, day: 10, method: "Débito" },
  { name: "Internet", amount: 32_000, day: 12, method: "Débito" },
  { name: "Gimnasio", amount: 55_000, day: 3, method: "Débito" },
  { name: "Streaming", amount: 14_000, day: 20, method: "Tarjeta Visa" },
];

const P = (pesos: number) => pesos * 100;

export async function seedGuest(guestId: string) {
  const db = drizzle(await guestPool(guestId), { schema: s });
  const now = currentMonth();
  const todayDate = today();
  const year = Number(now.slice(0, 4));

  // Pseudoaleatorio con semilla fija: todos los invitados ven los mismos ejemplos.
  let seed = 20_261_106;
  const random = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };
  const between = (min: number, max: number) => Math.round((min + random() * (max - min)) / 100) * 100;
  const dateIn = (month: string, day: number) =>
    `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;

  await db.transaction(async (tx) => {
    // Cada espacio de invitado tiene un único usuario, dueño de todos los datos ficticios.
    const [guest] = await tx
      .insert(s.users)
      .values({ id: GUEST_USER_ID, email: "invitado@nightspend.invalid", passwordHash: "!" })
      .returning({ id: s.users.id });
    // Recibe la tabla para que TypeScript sepa el tipo exacto de cada fila.
    function own<R extends { userId: number }>(table: { $inferInsert: R }, rows: Omit<R, "userId">[]): R[];
    function own<R extends { userId: number }>(table: { $inferInsert: R }, row: Omit<R, "userId">): R;
    function own(_table: unknown, value: object | object[]) {
      return Array.isArray(value) ? value.map((row) => ({ ...row, userId: guest.id })) : { ...value, userId: guest.id };
    }

    const categories = await tx
      .insert(s.categories)
      .values(own(s.categories, CATEGORIES.map((name, sortOrder) => ({ name, sortOrder }))))
      .returning();
    const methods = await tx.insert(s.paymentMethods).values(own(s.paymentMethods, METHODS)).returning();
    const cat = (name: string) => categories.find((c) => c.name === name)!.id;
    const method = (name: string) => methods.find((m) => m.name === name)!.id;

    // Gastos de los últimos meses
    const expenses: Omit<typeof s.expenses.$inferInsert, "userId">[] = [];
    const months = [-4, -3, -2, -1, 0].map((delta) => addMonths(now, delta));
    for (const month of months) {
      for (const group of VARIABLE_EXPENSES) {
        for (let i = 0; i < group.perMonth; i++) {
          const date = dateIn(month, 1 + Math.floor(random() * 28));
          const description = group.names[Math.floor(random() * group.names.length)];
          const amount = P(between(group.min, group.max));
          if (date > todayDate) continue;
          expenses.push({
            date,
            description,
            categoryId: cat(group.category),
            paymentMethodId: method(group.method),
            amount,
            amountArs: amount,
          });
        }
      }
      if (month === now) continue;
      for (const bill of MONTHLY_BILLS) {
        expenses.push({
          date: dateIn(month, bill.day),
          description: bill.name,
          categoryId: cat("Cuentas"),
          paymentMethodId: method(bill.method),
          amount: P(bill.amount),
          amountArs: P(bill.amount),
        });
      }
    }
    await tx.insert(s.expenses).values(own(s.expenses, expenses));

    // Fijos: los que ya vencieron este mes figuran pagados
    for (const bill of MONTHLY_BILLS) {
      const [recurring] = await tx
        .insert(s.recurrings)
        .values(own(s.recurrings, {
          name: bill.name,
          amount: P(bill.amount),
          categoryId: cat("Cuentas"),
          paymentMethodId: method(bill.method),
          frequency: "mensual",
          dueDay: bill.day,
        }))
        .returning();
      const paidOn = dateIn(now, bill.day);
      if (paidOn <= todayDate) {
        const [expense] = await tx
          .insert(s.expenses)
          .values(own(s.expenses, {
            date: paidOn,
            description: bill.name,
            categoryId: cat("Cuentas"),
            paymentMethodId: method(bill.method),
            amount: P(bill.amount),
            amountArs: P(bill.amount),
          }))
          .returning();
        await tx.insert(s.recurringPayments).values(own(s.recurringPayments, {
          recurringId: recurring.id,
          period: now,
          paidOn,
          amount: P(bill.amount),
          expenseId: expense.id,
        }));
      }
    }
    await tx.insert(s.recurrings).values(own(s.recurrings, [
      { name: "Resumen Tarjeta Visa", amount: P(180_000), categoryId: cat("Cuentas"), paymentMethodId: method("Tarjeta Visa"), frequency: "mensual", dueDay: 10, createsExpense: false },
      { name: "Seguro del hogar", amount: P(240_000), categoryId: cat("Cuentas"), paymentMethodId: method("Débito"), frequency: "anual", dueDay: 15, dueMonth: 8 },
      { name: "Dominio web", amount: P(45_000), categoryId: cat("Cuentas"), paymentMethodId: method("Tarjeta Visa"), frequency: "anual", dueDay: 20, dueMonth: 3 },
    ]));

    // Ingresos: un trabajo fijo que se registra solo y cobros variables en dólares
    await tx.insert(s.recurringIncomes).values(own(s.recurringIncomes, {
      name: "Sueldo",
      amount: P(1_850_000),
      payDay: 1,
      nextMonth: months[0],
    }));
    const rate = 1_500;
    await tx.insert(s.incomes).values(own(s.incomes, 
      [months[1], months[3]].map((month) => ({
        date: dateIn(month, 18),
        description: "Trabajo freelance",
        type: "variable" as const,
        amount: P(300),
        currency: "USD" as const,
        rate: String(rate),
        amountArs: P(300 * rate),
      })),
    ));

    // Cuotas: una compra propia y una de otra persona con su deuda
    const notebookDate = dateIn(months[2], 8);
    const [notebook] = await tx
      .insert(s.expenses)
      .values(own(s.expenses, {
        date: notebookDate,
        description: "Notebook",
        categoryId: cat("Personal"),
        paymentMethodId: method("Tarjeta Visa"),
        amount: P(1_200_000),
        amountArs: P(1_200_000),
        installments: 12,
      }))
      .returning();
    await tx.insert(s.installmentPlans).values(own(s.installmentPlans, {
      expenseId: notebook.id,
      description: "Notebook",
      paymentMethodId: method("Tarjeta Visa"),
      totalAmount: P(1_200_000),
      installments: 12,
      firstMonth: months[3],
    }));
    const [bikeDebt] = await tx
      .insert(s.debts)
      .values(own(s.debts, { direction: "me_deben", person: "Sofía", concept: "Bicicleta", amount: P(450_000) }))
      .returning();
    await tx.insert(s.debtPayments).values(own(s.debtPayments, { debtId: bikeDebt.id, date: dateIn(months[4], 1), amount: P(75_000) }));
    await tx.insert(s.installmentPlans).values(own(s.installmentPlans, {
      description: "Bicicleta de Sofía",
      paymentMethodId: method("Tarjeta Master"),
      totalAmount: P(450_000),
      installments: 6,
      firstMonth: now,
      otherPerson: "Sofía",
      debtId: bikeDebt.id,
    }));
    await tx.insert(s.debts).values(own(s.debts, [
      { direction: "me_deben", person: "Diego", concept: "Dólares prestados", amount: P(200), currency: "USD" },
      { direction: "debo", person: "Martín", concept: "Entradas del recital", amount: P(60_000) },
    ]));

    // Wishlist
    const projects = await tx
      .insert(s.wishProjects)
      .values(own(s.wishProjects, [
        { name: "Viaje a Mendoza", sortOrder: 0 },
        { name: "Casa", sortOrder: 1 },
      ]))
      .returning();
    const items = await tx
      .insert(s.wishItems)
      .values(own(s.wishItems, [
        { projectId: projects[0].id, name: "Pasajes y alojamiento", estimatedPrice: P(800_000), saved: P(250_000), priority: "alta" as const },
        { projectId: projects[1].id, name: "Silla de escritorio", estimatedPrice: P(350_000), saved: P(350_000), priority: "media" as const },
        { projectId: projects[1].id, name: "Pintar el living", estimatedPrice: P(180_000), priority: "baja" as const },
      ]))
      .returning();
    await tx.insert(s.wishSteps).values(own(s.wishSteps, [
      { itemId: items[0].id, text: "Comparar fechas y precios", done: true, sortOrder: 1 },
      { itemId: items[0].id, text: "Ahorrar el total", sortOrder: 2 },
      { itemId: items[0].id, text: "Reservar", sortOrder: 3 },
      { itemId: items[1].id, text: "Probar modelos en un local", done: true, sortOrder: 1 },
      { itemId: items[1].id, text: "Comprarla", sortOrder: 2 },
    ]));

    // Si el año actual ya pasó marzo, el dominio figura pagado (sin sumar a los últimos meses).
    const paidOn = `${year}-03-20`;
    if (paidOn <= todayDate) {
      const [domain] = await tx
        .select({ id: s.recurrings.id })
        .from(s.recurrings)
        .where(eq(s.recurrings.name, "Dominio web"));
      await tx.insert(s.recurringPayments).values(own(s.recurringPayments, { recurringId: domain.id, period: String(year), paidOn, amount: P(45_000) }));
    }
  });
}
