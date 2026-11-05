import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Em desenvolvimento, o Vite (porta 3000) repassa /api e /media para o Django (porta 8000).
const DJANGO = process.env.DJANGO_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: { "/api": DJANGO, "/media": DJANGO },
  },
  preview: {
    port: 3000,
    proxy: { "/api": DJANGO, "/media": DJANGO },
  },
});
