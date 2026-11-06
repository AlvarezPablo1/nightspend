"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Si el destino termina siendo la misma pantalla, el indicador no queda colgado.
const MAX_VISIBLE_MS = 15_000;
export const LOADING_EVENT = "nightspend:loading";

function isInternalNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) return false;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return false;
  return url.pathname + url.search !== location.pathname + location.search;
}

/** Indicador de carga al cambiar de pantalla: aparece apenas se toca, sin esperar al servidor. */
export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => setLoading(false), [pathname, searchParams]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) setLoading(true);
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (form.method === "get" && !form.getAttribute("action")?.startsWith("/api/")) setLoading(true);
    };
    const onLoading = (event: Event) => setLoading((event as CustomEvent<boolean>).detail);
    // En captura: los enlaces y formularios de Next cancelan el evento antes de que llegue arriba.
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener(LOADING_EVENT, onLoading);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener(LOADING_EVENT, onLoading);
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), MAX_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  if (!loading) return null;
  return (
    <div role="status" aria-label="Cargando" className="loader-overlay fixed inset-0 z-40 flex items-center justify-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface shadow-lg">
        <span className="spinner" />
      </span>
    </div>
  );
}
