const BARS = [
  { x: 136, y: 276, height: 100 },
  { x: 228, y: 196, height: 180 },
  { x: 320, y: 136, height: 240 },
];
const BAR_WIDTH = 56;
const BAR_RADIUS = 12;

/** La misma barra del logo, como agujero: por ahí se ve la app al acercarse. */
function barHole({ x, y, height }: (typeof BARS)[number]) {
  const r = BAR_RADIUS;
  const w = BAR_WIDTH - 2 * r;
  const h = height - 2 * r;
  return `M${x + r} ${y}h${w}a${r} ${r} 0 0 1 ${r} ${r}v${h}a${r} ${r} 0 0 1 ${-r} ${r}h${-w}a${r} ${r} 0 0 1 ${-r} ${-r}v${-h}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

// Fondo mucho más grande que el logo para cubrir toda la pantalla antes del zoom.
const COVER = "M-6000 -6000H6512V6512H-6000z";
const OVERLAY_PATH = COVER + BARS.map(barHole).join("");

// Corre mientras se lee el HTML, antes de pintar: una sola vez cada vez que se abre la app.
const PLAY_ONCE = `try{if(!sessionStorage.getItem("splash")){sessionStorage.setItem("splash","1");document.getElementById("splash").dataset.play=""}}catch(e){}`;

/** Pantalla de entrada en el celular: el logo se acerca hasta mostrar la app. Solo CSS, no depende de React. */
export function Splash() {
  return (
    <>
      <div id="splash" aria-hidden="true" suppressHydrationWarning>
        <svg viewBox="0 0 512 512">
          <path d={OVERLAY_PATH} fillRule="evenodd" />
          <g>
            {BARS.map((bar) => (
              <rect key={bar.x} x={bar.x} y={bar.y} width={BAR_WIDTH} height={bar.height} rx={BAR_RADIUS} />
            ))}
          </g>
        </svg>
      </div>
      <script dangerouslySetInnerHTML={{ __html: PLAY_ONCE }} />
    </>
  );
}
