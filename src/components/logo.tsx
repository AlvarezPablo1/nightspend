/** Las tres barras del ícono de la app. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="112 112 288 288" className={className} aria-hidden="true">
      <rect x="136" y="276" width="56" height="100" rx="12" fill="currentColor" opacity="0.55" />
      <rect x="228" y="196" width="56" height="180" rx="12" fill="currentColor" opacity="0.8" />
      <rect x="320" y="136" width="56" height="240" rx="12" fill="currentColor" />
    </svg>
  );
}
