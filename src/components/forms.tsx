"use client";

import { X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { ActionResult } from "@/app/actions";
import { money, parseMoney, shortDate } from "@/lib/format";

type ServerAction = (form: FormData) => Promise<ActionResult>;

const SheetContext = createContext<{ close: () => void } | null>(null);

// iOS sigue desplazando la página detrás de un dialog si no se fija el body.
let lockedScrollY: number | null = null;

function lockPageScroll() {
  if (lockedScrollY !== null) return;
  lockedScrollY = window.scrollY;
  Object.assign(document.body.style, {
    position: "fixed",
    top: `-${lockedScrollY}px`,
    left: "0",
    right: "0",
    width: "100%",
  });
}

function unlockPageScroll() {
  if (lockedScrollY === null) return;
  const y = lockedScrollY;
  lockedScrollY = null;
  Object.assign(document.body.style, { position: "", top: "", left: "", right: "", width: "" });
  window.scrollTo({ top: y, behavior: "instant" });
}

/** Panel inferior en el celular y modal centrado en la compu. */
export function Sheet({
  trigger,
  triggerClassName = "btn",
  triggerLabel,
  title,
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const ownsLock = useRef(false);
  const pressedOutside = useRef(false);
  // Un toque en el fondo llega como evento del propio dialog, con coordenadas fuera de su caja.
  const isOutside = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return false;
    const box = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
    );
  };
  const release = () => {
    if (!ownsLock.current) return;
    ownsLock.current = false;
    unlockPageScroll();
  };
  const close = () => {
    ref.current?.close();
    release();
  };
  const open = () => {
    ownsLock.current = true;
    lockPageScroll();
    ref.current?.showModal();
    // El foco queda en la ventana: sin recuadro en la cruz y sin abrir el teclado solo.
    ref.current?.focus();
  };
  // Si el ítem desaparece con la ventana abierta (por ejemplo, al borrarlo), se libera igual.
  useEffect(() => {
    return () => {
      if (ownsLock.current) unlockPageScroll();
    };
  }, []);
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        onClick={open}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        className="sheet"
        tabIndex={-1}
        onClose={release}
        // Tiene que empezar y terminar afuera: arrastrar desde un campo no cierra la ventana.
        onPointerDown={(event) => {
          pressedOutside.current = isOutside(event);
        }}
        onClick={(event) => {
          if (pressedOutside.current && isOutside(event)) close();
          pressedOutside.current = false;
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="-mr-2 flex h-11 w-11 cursor-pointer items-center justify-center text-muted"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <SheetContext.Provider value={{ close }}>{children}</SheetContext.Provider>
        </div>
      </dialog>
    </>
  );
}

/**
 * Hace que todo el ítem se pueda tocar para editarlo. El contenedor tiene que ser
 * `relative`, y los botones propios del ítem deben ir con `relative z-10` para quedar encima.
 */
export function EditSheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Sheet
      title={title}
      triggerLabel={title}
      triggerClassName="absolute inset-0 z-5 cursor-pointer rounded-lg hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-accent"
      trigger={null}
    >
      {children}
    </Sheet>
  );
}

export function MethodSelect({
  methods,
  defaultValue,
  label = "Medio de pago",
}: {
  methods: { id: number; name: string }[];
  defaultValue?: number | null;
  label?: string;
}) {
  return (
    <Field label={label}>
      <select name="paymentMethodId" required defaultValue={defaultValue ?? ""} className="input">
        <option value="" disabled>
          Elegí uno
        </option>
        {methods.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Formulario que conserva lo escrito si hay un error, y cierra el panel si sale bien. */
export function ActionForm({
  action,
  submitLabel = "Guardar",
  resetOnSuccess = false,
  onSuccess,
  className = "space-y-4",
  submitClassName = "btn btn-primary w-full",
  pendingLabel = "Guardando…",
  children,
}: {
  action: ServerAction;
  submitLabel?: string;
  submitClassName?: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const sheet = useContext(SheetContext);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    start(async () => {
      try {
        const result = await action(data);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setError(null);
        if (resetOnSuccess) form.reset();
        sheet?.close();
        onSuccess?.();
      } catch (err) {
        // redirect() viaja como excepción y Next lo maneja solo.
        if (err && typeof err === "object" && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        setError("No se pudo guardar. Probá de nuevo.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={submitClassName}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

/** Botón que ejecuta una acción con campos ocultos; con `confirm` pide un segundo toque. */
export function ActionButton({
  action,
  fields,
  confirm,
  className = "btn",
  label,
  children,
}: {
  action: ServerAction;
  fields: Record<string, string | number>;
  confirm?: string;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const sheet = useContext(SheetContext);
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);

  function run() {
    if (confirm && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, String(v));
    start(async () => {
      await action(data);
      setArmed(false);
      sheet?.close();
    });
  }

  return (
    <button type="button" aria-label={armed ? undefined : label} disabled={pending} onClick={run} className={className}>
      {armed ? confirm : children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** "¿Es un gasto tuyo?": si es de otra persona, pide quién te lo tiene que pasar. */
export function OwnerFields({
  people = [],
  defaultPerson,
  defaultOwed = "",
  onChange,
}: {
  people?: string[];
  defaultPerson?: string | null;
  defaultOwed?: string;
  onChange?: (isOther: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [isOther, setIsOther] = useState(!!defaultPerson);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onReset = () => setIsOther(!!defaultPerson);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultPerson]);

  const choose = (value: boolean) => {
    setIsOther(value);
    onChange?.(value);
  };

  return (
    <div ref={ref} className="space-y-3">
      <input type="hidden" name="isMine" value={isOther ? "no" : "si"} />
      <div>
        <span className="label">¿Es un gasto tuyo?</span>
        <div className="flex gap-2">
          <button type="button" aria-pressed={!isOther} onClick={() => choose(false)} className={`chip ${!isOther ? "chip-on" : ""}`}>
            Sí, es mío
          </button>
          <button type="button" aria-pressed={isOther} onClick={() => choose(true)} className={`chip ${isOther ? "chip-on" : ""}`}>
            No, es de otra persona
          </button>
        </div>
      </div>
      {isOther && (
        <>
          <Field label="¿Quién te tiene que pasar la plata?">
            <input name="otherPerson" required list={listId} defaultValue={defaultPerson ?? ""} autoComplete="off" className="input" />
          </Field>
          <datalist id={listId}>
            {people.map((person) => (
              <option key={person} value={person} />
            ))}
          </datalist>
          <Field label="¿Cuánto te debe? (opcional)">
            <input name="debtAmount" inputMode="decimal" defaultValue={defaultOwed} placeholder="El total de la compra" autoComplete="off" className="input num" />
          </Field>
          <p className="text-xs text-muted">No suma a tus gastos y se agrega a &quot;Me deben&quot; en Deudas.</p>
        </>
      )}
    </div>
  );
}

type Quote = { rate: number; date: string; label: string };

/**
 * Monto + moneda. Con `rateSide`, los dólares se convierten solos con la cotización de
 * la fecha del formulario, y queda la opción de usar otra (o cargarla si el servicio falla).
 */
export function AmountField({
  name = "amount",
  label = "Monto",
  defaultValue = "",
  defaultCurrency = "ARS",
  showCurrency = true,
  required = true,
  rateSide,
  savedRate,
  savedDate,
}: {
  name?: string;
  label?: string;
  defaultValue?: string;
  defaultCurrency?: string;
  showCurrency?: boolean;
  required?: boolean;
  rateSide?: "compra" | "venta";
  savedRate?: string | null;
  savedDate?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState("");
  const [typedAmount, setTypedAmount] = useState(defaultValue);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [failed, setFailed] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualRate, setManualRate] = useState("");

  // El monto y la fecha se leen del formulario, sea cual sea el componente que los dibuja.
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const sync = () => {
      const dateField = form.elements.namedItem("date");
      const amountField = form.elements.namedItem(name);
      setDate(dateField instanceof HTMLInputElement ? dateField.value : "");
      setTypedAmount(amountField instanceof HTMLInputElement ? amountField.value : "");
    };
    const syncAfterReset = () => {
      setCurrency(defaultCurrency);
      setManual(false);
      setManualRate("");
      setTimeout(sync, 0);
    };
    sync();
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    form.addEventListener("reset", syncAfterReset);
    return () => {
      form.removeEventListener("input", sync);
      form.removeEventListener("change", sync);
      form.removeEventListener("reset", syncAfterReset);
    };
  }, [name, defaultCurrency]);

  const usesRate = !!rateSide && currency === "USD";
  const usesSaved = !!savedRate && date === savedDate;
  const shouldLookup = usesRate && !!date && !usesSaved;

  useEffect(() => {
    if (!shouldLookup) return;
    const controller = new AbortController();
    setQuote(null);
    setFailed(false);
    fetch(`/api/cotizacion?fecha=${date}&lado=${rateSide}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((result: Quote) => setQuote(result))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [shouldLookup, date, rateSide]);

  const manualActive = usesRate && (manual || (failed && !usesSaved));
  const effectiveRate = manualActive
    ? (parseMoney(manualRate) ?? 0) / 100
    : usesSaved
      ? Number(savedRate)
      : quote?.rate;
  const amountCents = parseMoney(typedAmount);

  return (
    <div ref={ref} className="space-y-4">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Field label={label}>
            <input
              name={name}
              inputMode="decimal"
              autoComplete="off"
              required={required}
              defaultValue={defaultValue}
              placeholder="0"
              className="input num"
            />
          </Field>
        </div>
        {showCurrency && (
          <div className="w-24">
            <Field label="Moneda">
              <select
                name="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </Field>
          </div>
        )}
      </div>

      {usesRate && (
        <div className="space-y-2 text-sm" aria-live="polite">
          {manualActive ? (
            <Field label={failed ? "No pude obtener la cotización: cargala a mano" : "Cotización (pesos por dólar)"}>
              <input
                name="rate"
                required
                inputMode="decimal"
                value={manualRate}
                onChange={(e) => setManualRate(e.target.value)}
                className="input num"
              />
            </Field>
          ) : usesSaved ? (
            <p className="num text-muted">Cotización guardada: {money(Math.round(Number(savedRate) * 100))}</p>
          ) : quote ? (
            <p className="num text-muted">
              Dólar {quote.label.toLowerCase()} del {shortDate(quote.date)}: {money(Math.round(quote.rate * 100))}
            </p>
          ) : (
            <p className="text-muted">Buscando cotización…</p>
          )}
          {!!effectiveRate && !!amountCents && (
            <p className="num">Equivale a {money(Math.round(amountCents * effectiveRate))}</p>
          )}
          {!(failed && !usesSaved) && (
            <button
              type="button"
              onClick={() => setManual(!manual)}
              className="min-h-8 cursor-pointer text-xs text-muted underline"
            >
              {manual ? "Usar la cotización automática" : "Usar otra cotización"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
