"use client";

import { useEffect } from "react";

/** Safari en iPhone ignora el viewport para el zoom con dos dedos: hay que cancelar el gesto. */
export function NoZoom() {
  useEffect(() => {
    const prevent = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", prevent, { passive: false });
    return () => document.removeEventListener("gesturestart", prevent);
  }, []);
  return null;
}
