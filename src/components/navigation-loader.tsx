"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingOverlay } from "./loading-overlay";

// Si el destino termina siendo la misma pantalla, el indicador no queda colgado.
const MAX_VISIBLE_MS = 15_000;
export const LOADING_EVENT = "nightspend:loading";
const DEFAULT_MESSAGE = "Cargando…";
const CURRENT_KEY = "nightspend:current";
const PREVIOUS_KEY = "nightspend:previous";

/** Pantalla anterior, para volver a ella después de editar o borrar. */
export function previousPath() {
  try {
    return sessionStorage.getItem(PREVIOUS_KEY);
  } catch {
    return null;
  }
}

function isInternalNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) return false;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return false;
  return url.pathname + url.search !== location.pathname + location.search;
}

/** Loader al cambiar de pantalla: aparece apenas se toca, sin esperar al servidor. */
export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessage(null);
    try {
      const search = searchParams.toString();
      const current = pathname + (search ? `?${search}` : "");
      const stored = sessionStorage.getItem(CURRENT_KEY);
      if (stored !== current) {
        if (stored) sessionStorage.setItem(PREVIOUS_KEY, stored);
        sessionStorage.setItem(CURRENT_KEY, current);
      }
    } catch {
      // Sin almacenamiento se vuelve a la lista del mes.
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) setMessage(DEFAULT_MESSAGE);
    };
    const onSubmit = (event: SubmitEvent) => {
      // Solo los buscadores navegan: los formularios de acciones no tienen destino propio.
      const form = event.target as HTMLFormElement;
      const destination = form.getAttribute("action");
      if (form.method === "get" && destination && !destination.startsWith("/api/")) setMessage(DEFAULT_MESSAGE);
    };
    const onLoading = (event: Event) => setMessage((event as CustomEvent<string | null>).detail);
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

  const active = message !== null;
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setMessage(null), MAX_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [active]);

  return message === null ? null : <LoadingOverlay message={message} />;
}
