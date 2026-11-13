/**
 * Brillos violetas de fondo, los mismos de la ilustración del login. Quedan detrás del contenido:
 * el contenedor tiene que ser `relative` (o fijo), `isolate` y `overflow-hidden`.
 *
 * Son degradados y no círculos con `blur`: Safari en iPhone dibuja los blur grandes por
 * partes y, al tocar algo encima, repinta esa zona sin el brillo.
 */
const GLOW = [
  "radial-gradient(circle 380px at 112px 80px, color-mix(in srgb, var(--primary) 30%, transparent), transparent)",
  "radial-gradient(circle 340px at calc(100% - 114px) calc(100% - 50px), color-mix(in srgb, var(--accent) 20%, transparent), transparent)",
].join(", ");

export function Glow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 ${className}`}
      style={{ backgroundImage: GLOW }}
    />
  );
}
