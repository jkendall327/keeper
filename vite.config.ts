import { defineConfig, type PluginOption } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: [".ts.net"],
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }) as PluginOption,
  ],
});
