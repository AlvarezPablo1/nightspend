# Nightspend

App web para llevar el orden de los gastos personales, pensada para usarse en el navegador y en el celular, con un diseño simple en modo noche.

**Demo:** https://nightspend.vercel.app. Tocá "Entrar como invitado" para probarla con datos ficticios.

## Funciones

- Gastos en tabla o lista, por mes y por año, con búsqueda y categorías
- Estadísticas por día, mes y categoría
- Cuentas y suscripciones fijas, mensuales y anuales
- Compras en cuotas y lo comprometido a futuro
- Compras con tu tarjeta para otra persona, que generan una deuda a tu favor
- Ingresos manuales y trabajos fijos que se registran solos cada mes
- Conversión automática de dólares a pesos con la cotización de cada día
- Deudas, wishlist con pasos y exportación a Excel o CSV
- Instalable en el celular

## Tecnologías

Next.js, TypeScript, Tailwind CSS, PostgreSQL y Drizzle ORM. Publicada en Vercel con Neon.

## Modo invitado

Cada visitante recibe un espacio propio con datos ficticios, que se borra a las 24 horas.

- Los invitados usan otra base (`DEMO_DATABASE_URL`) y nunca se conectan a la real. Tiene que ser una conexión directa, no un pooler en modo transacción. Si se deja vacía, el botón no aparece.
- Cada invitado tiene su propio schema. Hay hasta 30 activos y 30 nuevos cada 10 minutos: al pasar el primer tope se borra el más antiguo, y al pasar el segundo se rechaza la entrada.
- Si la sesión no se puede leer o la demo está mal configurada, la consulta falla en lugar de llegar a la base real.
- Los datos ficticios están en `src/lib/demo-seed.ts`.

## Correrla en tu compu

```bash
docker compose up -d
docker compose exec db createdb -U gastos gastos_demo
npm install
cp .env.example .env.local   # completar AUTH_SECRET y APP_PASSWORD_HASH
npm run db:migrate
npm run dev
```

La base principal arranca vacía, porque el importador de datos personales no forma parte del repositorio. Para ver la app con contenido, usá "Entrar como invitado".

## Publicación

Cada cambio que llega a `main` se publica solo en Vercel. Las migraciones de la base se aplican aparte, con `npm run db:migrate`.

## Resúmenes por mail

Vercel llama a `/api/cron/backup` los días 1, 2 y 3 de cada mes. Envía con Resend el resumen del mes que terminó y, en enero, también el del año anterior, con su Excel. Cada uno sale una sola vez, y si falla se reintenta al día siguiente. Necesita `CRON_SECRET`, `RESEND_API_KEY` y `BACKUP_EMAIL`.

## Reglas de cálculo

- Una compra suma completa el día que se hizo, aunque sea en cuotas. Las cuotas solo muestran lo comprometido a futuro.
- El resumen de tarjeta es un fijo de tipo "recordatorio": no suma como gasto, para no contar dos veces.
- Una compra de otra persona con tu tarjeta no suma a tus gastos: queda en Cuotas y genera una deuda en "Me deben".
- "Te queda disponible" es ingresos menos gastos, fijos pendientes y cuotas del mes. No resta el resumen de tarjeta, y las cuotas de una compra hecha este mes tampoco, porque esa compra ya sumó completa.
- Los trabajos fijos generan su ingreso al abrir la app, una vez alcanzado el día de cobro, y recuperan los meses que falten. Un cobro borrado a mano no se vuelve a crear.
- La cotización del dólar viene de dolarapi.com (hoy) y argentinadatos.com (fechas pasadas): venta en gastos y compra en ingresos. El tipo de dólar se elige en Ajustes.
- Los montos se guardan en centavos. Los movimientos en dólares guardan su cotización y su equivalente en pesos.
