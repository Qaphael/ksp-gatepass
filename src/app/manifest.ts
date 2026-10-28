import type { MetadataRoute } from "next";

/** These colors mirror --brand-900 and --ivory in globals.css. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KSP GatePass",
    short_name: "GatePass",
    description: "Ticket sales and gate verification for KSP Hotel Gulu",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf7f0",
    theme_color: "#0a2a20",
    icons: [
      {
        src: "/icons/ksp-gatepass-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/ksp-gatepass-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
