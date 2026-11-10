import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Only the app in src/ is built here. The Pages Functions in functions/ are bundled by wrangler.
// The dev server may also read docs/eval/, where the Scorecard reads the reviewed reference labels from.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: true },
  server: { port: 5173, fs: { allow: [".", "../docs/eval"] } },
});
