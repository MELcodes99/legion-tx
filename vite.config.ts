import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub out native USB module to prevent build errors
      "usb": path.resolve(__dirname, "./src/stubs/usb.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["usb"],
  },
  build: {
    rollupOptions: {
      external: ["usb"],
    },
  },
}));
