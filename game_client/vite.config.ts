import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    target: "es2020",
  },
  define: {
    // Some Web3 dependencies reference the Node.js `global` object.
    global: "globalThis",
  },
});
