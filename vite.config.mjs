import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "client",
  plugins: [react(), tailwindcss()],
  publicDir: "../public",
  server: {
    proxy: { "/api": process.env.API_PROXY_TARGET || "http://localhost:3000" },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
