import { CalendarClock, CreditCard, HandCoins, Heart, Settings, Wallet } from "lucide-react";

export const MORE_LINKS = [
  { href: "/fijos", label: "Fijos", hint: "Suscripciones y cuentas", icon: CalendarClock },
  { href: "/cuotas", label: "Cuotas", hint: "Lo comprometido a futuro", icon: CreditCard },
  { href: "/wishlist", label: "Wishlist", hint: "Compras futuras paso a paso", icon: Heart },
  { href: "/ingresos", label: "Ingresos", hint: "Fijos y variables", icon: Wallet },
  { href: "/deudas", label: "Deudas", hint: "Lo que debo y me deben", icon: HandCoins },
  { href: "/ajustes", label: "Ajustes", hint: "Categorías, medios de pago y backup", icon: Settings },
];
