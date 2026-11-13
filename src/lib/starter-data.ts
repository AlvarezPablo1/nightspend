import type { db } from "@/db";
import * as s from "@/db/schema";

export const STARTER_CATEGORIES = [
  "Mercadería", "Cuentas", "Transporte", "Salidas", "Personal",
  "Mascotas", "Salud", "Hogar", "Transferencias", "Otros",
];

const STARTER_METHODS = [
  { name: "Efectivo", type: "efectivo" as const },
  { name: "Débito", type: "debito" as const },
  { name: "Transferencia", type: "transferencia" as const },
  { name: "Tarjeta de crédito", type: "credito" as const },
];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Una cuenta nueva arranca con categorías y medios de pago, para poder cargar un gasto enseguida. */
export async function createStarterData(tx: Tx, userId: number) {
  await tx.insert(s.categories).values(STARTER_CATEGORIES.map((name, sortOrder) => ({ userId, name, sortOrder })));
  await tx.insert(s.paymentMethods).values(STARTER_METHODS.map((method) => ({ userId, ...method })));
}
