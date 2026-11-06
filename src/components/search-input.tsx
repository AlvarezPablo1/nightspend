"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** Buscador con una cruz para borrar todo de una vez y volver a la lista completa. */
export function SearchInput({ defaultValue = "", clearHref }: { defaultValue?: string; clearHref: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  function clear() {
    setValue("");
    input.current?.focus();
    if (defaultValue) router.push(clearHref);
  }

  return (
    <>
      <Search size={18} className="pointer-events-none absolute top-3.5 left-3 text-muted" />
      <input
        ref={input}
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Buscar gastos"
        placeholder="Buscar en este mes"
        className="input pr-11! pl-10!"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Borrar búsqueda"
          className="absolute top-0 right-0 flex h-11 w-11 cursor-pointer items-center justify-center text-muted"
        >
          <X size={18} />
        </button>
      )}
    </>
  );
}
