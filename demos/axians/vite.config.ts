import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  base: "./", // relative URLs: the app is served under /axians/ by the demos gateway
  publicDir: "../../public",
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { port: 5173, host: true, proxy: { "/api/": "http://localhost:3000" } },
});
