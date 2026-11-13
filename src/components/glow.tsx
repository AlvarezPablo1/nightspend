/**
 * Brillos violetas de fondo, los mismos de la ilustración del login. Quedan detrás del contenido:
 * el contenedor tiene que ser `relative` (o fijo), `isolate` y `overflow-hidden`.
 */
export function Glow({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 ${className}`}>
      <div className="absolute -top-40 -left-32 h-[480px] w-[480px] rounded-full bg-primary/30 blur-[120px]" />
      <div className="absolute -right-24 bottom-[-160px] h-[420px] w-[420px] rounded-full bg-accent/20 blur-[120px]" />
    </div>
  );
}
