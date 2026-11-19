import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { PwaInstallProvider } from "@/components/pwa/install-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-app" });

export const metadata: Metadata = {
  title: "KSP GatePass",
  description: "Ticket sales and gate verification for KSP Hotel Gulu",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08090a",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col">
        <PwaInstallProvider>{children}</PwaInstallProvider>
      </body>
    </html>
  );
}
