"use client";

import { Trash2 } from "lucide-react";
import { deleteExpense } from "@/app/actions";
import { ActionButton } from "./forms";
import { previousPath } from "./navigation-loader";

export function DeleteExpenseButton({ id }: { id: number }) {
  return (
    <ActionButton
      action={deleteExpense}
      fields={() => ({ id, returnTo: previousPath() ?? "" })}
      confirm="Tocá de nuevo para borrar"
      className="btn mt-3 w-full text-bad"
    >
      <Trash2 size={16} /> Borrar gasto
    </ActionButton>
  );
}
