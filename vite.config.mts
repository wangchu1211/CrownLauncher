import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "Source/Renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/Renderer",
    emptyOutDir: true,
  },
});
