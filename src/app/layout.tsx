import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { PwaInstallProvider } from "@/components/pwa/install-provider";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-app" });

export const metadata: Metadata = {
  title: "KSP GatePass",
  description: "Ticket sales and gate verification for KSP Hotel Gulu",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a2a20",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${geist.variable}`}>
      <body className="min-h-full flex flex-col">
        <PwaInstallProvider>{children}</PwaInstallProvider>
      </body>
    </html>
  );
}
