import { defineConfig } from "vitest/config";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { appMetadataDefines } from "./app-metadata.ts";

export default defineConfig({
  define: appMetadataDefines(),
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  test: {
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
      "server/**/__tests__/**/*.test.ts",
    ],
    environment: "happy-dom",
    setupFiles: ["./src/__tests__/setup.ts"],
    testTimeout: 15000,
    sequence: {
      concurrent: false,
    },
  },
});
