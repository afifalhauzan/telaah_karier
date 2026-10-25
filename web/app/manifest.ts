import type { MetadataRoute } from "next";

// Installed on a phone, TelaahKarier shows up in the share sheet of Instagram, TikTok, or WhatsApp:
// what is shared opens in TelaahLoker as a draft (components/chat.tsx, SHARE_PARAMS).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TelaahKarier",
    short_name: "TelaahKarier",
    description: "Telaah risiko lowongan kerja sebelum kamu mendaftar.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a9fa6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    share_target: {
      action: "/chat",
      method: "GET",
      params: { title: "share_title", text: "share_text", url: "share_url" },
    },
  };
}
