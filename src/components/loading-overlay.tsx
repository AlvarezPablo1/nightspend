"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

let activeOverlays = 0;
const stop = (event: Event) => event.preventDefault();
const stopEscape = (event: KeyboardEvent) => {
  if (event.key === "Escape") event.preventDefault();
};

function blockScroll() {
  activeOverlays += 1;
  if (activeOverlays > 1) return;
  // overflow frena también la barra de desplazamiento; los eventos, las ventanas con scroll propio.
  document.documentElement.style.overflow = "hidden";
  document.addEventListener("wheel", stop, { passive: false, capture: true });
  document.addEventListener("touchmove", stop, { passive: false, capture: true });
  document.addEventListener("keydown", stopEscape, true);
}

function unblockScroll() {
  activeOverlays -= 1;
  if (activeOverlays > 0) return;
  document.documentElement.style.overflow = "";
  document.removeEventListener("wheel", stop, true);
  document.removeEventListener("touchmove", stop, true);
  document.removeEventListener("keydown", stopEscape, true);
}

/** Loader de pantalla completa con un mensaje debajo. Se dibuja por encima de cualquier ventana abierta. */
export function LoadingOverlay({ message }: { message: string }) {
  useEffect(() => {
    blockScroll();
    return unblockScroll;
  }, []);

  // Una ventana abierta está en una capa superior: el loader tiene que ir adentro para taparla.
  const target = document.querySelector("dialog[open]") ?? document.body;
  return createPortal(
    <div role="status" aria-label={message} className="loader-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="flex min-w-36 flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4 shadow-lg">
        <span className="spinner" aria-hidden />
        <p className="text-sm text-ink">{message}</p>
      </div>
    </div>,
    target,
  );
}
