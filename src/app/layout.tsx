import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nightspend",
  description: "Control personal de gastos",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Nightspend", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0e0b14",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
