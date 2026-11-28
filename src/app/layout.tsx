import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <PwaInstallProvider>{children}</PwaInstallProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
