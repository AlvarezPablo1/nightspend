"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveExpense, type ActionResult } from "@/app/actions";
import { addMonths } from "@/lib/format";
import { ActionForm, AmountField, Field, OwnerFields } from "./forms";
import { LOADING_EVENT, previousPath } from "./navigation-loader";

export type ExpenseOptions = {
  categories: { id: number; name: string }[];
  methods: { id: number; name: string; type: string }[];
  suggestions: { description: string; categoryId: number; paymentMethodId: number | null }[];
  today: string;
  people?: string[];
};

type Initial = {
  id?: number;
  date?: string;
  description?: string;
  categoryId?: number;
  paymentMethodId?: number | null;
  amount?: string;
  currency?: string;
  rate?: string | null;
  installments?: number;
  firstMonth?: string;
  note?: string | null;
};

type ExpenseFormProps = {
  options: ExpenseOptions;
  initial?: Initial;
  action?: (form: FormData) => Promise<ActionResult>;
  hiddenId?: number;
  submitLabel?: string;
  /** Muestra "¿Es un gasto tuyo?" al elegir una tarjeta. Solo para gastos nuevos. */
  allowOtherOwner?: boolean;
};

/** Al guardar un gasto nuevo, el formulario vuelve a empezar de cero para el próximo. */
export function ExpenseForm(props: ExpenseFormProps) {
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const isNew = !props.initial?.id && !props.hiddenId;
  // Al terminar de editar, vuelve a la pantalla desde la que se abrió el gasto.
  const goBack = () => {
    window.dispatchEvent(new CustomEvent(LOADING_EVENT, { detail: "Guardando cambios…" }));
    const previous = previousPath();
    if (window.history.length > 1 && previous) router.back();
    else router.push(`/gastos?mes=${props.initial?.date?.slice(0, 7) ?? ""}`);
  };
  const onSaved = isNew ? () => setVersion(version + 1) : props.initial?.id ? goBack : undefined;
  return <ExpenseFields key={version} {...props} onSaved={onSaved} />;
}

function ExpenseFields({
  options,
  initial = {},
  action = saveExpense,
  hiddenId,
  submitLabel,
  allowOtherOwner = false,
  onSaved,
}: ExpenseFormProps & { onSaved?: () => void }) {
  const [description, setDescription] = useState(initial.description ?? "");
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? options.categories[0]?.id);
  const [methodId, setMethodId] = useState(initial.paymentMethodId ? String(initial.paymentMethodId) : "");
  const [date, setDate] = useState(initial.date ?? options.today);
  const [focused, setFocused] = useState(false);
  const [isOther, setIsOther] = useState(false);

  const query = description.trim().toLowerCase();
  const matches =
    focused && query.length >= 2
      ? options.suggestions
          .filter((s) => s.description.toLowerCase().includes(query) && s.description.toLowerCase() !== query)
          .slice(0, 4)
      : [];

  const isCredit = options.methods.find((m) => String(m.id) === methodId)?.type === "credito";
  const nextMonth = addMonths(date.slice(0, 7), 1);
  const forOther = allowOtherOwner && isCredit && isOther;

  function pick(s: ExpenseOptions["suggestions"][number]) {
    setDescription(s.description);
    setCategoryId(s.categoryId);
    if (s.paymentMethodId) setMethodId(String(s.paymentMethodId));
    setFocused(false);
  }

  return (
    <ActionForm
      action={action}
      onSuccess={onSaved}
      submitLabel={submitLabel}
      pendingLabel={hiddenId ? "Registrando compra…" : undefined}
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {hiddenId && <input type="hidden" name="id" value={hiddenId} />}
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />

      <AmountField
        defaultValue={initial.amount}
        defaultCurrency={initial.currency}
        rateSide={forOther ? undefined : "venta"}
        savedRate={initial.rate}
        savedDate={initial.date}
      />

      <Field label="Descripción">
        <input
          name="description"
          required
          autoComplete="off"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Verdulería, Uber…"
          className="input"
        />
      </Field>
      {matches.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-2">
          {matches.map((s) => (
            <button key={s.description} type="button" className="chip" onClick={() => pick(s)}>
              {s.description}
            </button>
          ))}
        </div>
      )}

      <div hidden={forOther}>
        <span className="label">Categoría</span>
        <div className="flex flex-wrap gap-2">
          {options.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === categoryId}
              onClick={() => setCategoryId(c.id)}
              className={`chip ${c.id === categoryId ? "chip-on" : ""}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <input
            type="date"
            name="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Medio de pago">
          <select
            name="paymentMethodId"
            required
            value={methodId}
            onChange={(e) => setMethodId(e.target.value)}
            className="input"
          >
            <option value="" disabled>
              Elegí uno
            </option>
            {options.methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {isCredit && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cuotas">
            <input
              name="installments"
              type="number"
              min={1}
              max={60}
              defaultValue={initial.installments ?? 1}
              className="input num"
            />
          </Field>
          <Field label="Primera cuota">
            <input
              name="firstMonth"
              type="month"
              key={nextMonth}
              defaultValue={initial.firstMonth ?? nextMonth}
              className="input"
            />
          </Field>
        </div>
      )}

      {allowOtherOwner && isCredit && (
        <OwnerFields people={options.people} onChange={setIsOther} />
      )}

      <details open={!!initial.note}>
        <summary className="cursor-pointer text-sm text-muted">Agregar nota</summary>
        <input
          name="note"
          aria-label="Nota"
          defaultValue={initial.note ?? ""}
          autoComplete="off"
          className="input mt-2"
        />
      </details>
    </ActionForm>
  );
}
