import type { ReactNode } from "react";
import { Nunito } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  fallback: ["ui-rounded", "Trebuchet MS", "sans-serif"],
});

export const metadata = {
  title: "Skyjo",
  description: "Joue à Skyjo en ligne ou contre des bots.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#041910",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${nunito.className} min-h-dvh bg-[#041910] text-white antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
