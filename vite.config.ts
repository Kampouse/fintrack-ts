import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devApiPlugin } from "./vite-dev-api";

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    allowedHosts: [".trycloudflare.com", "localhost"],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ["echarts"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
