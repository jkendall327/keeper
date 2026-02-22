import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              compilationMode: "infer",
              panicThreshold: "NONE",
              environment: {
                enableTreatRefLikeIdentifiersAsRefs: true,
                enableTreatFunctionDepsAsConst: false,
              },
            },
          ],
        ],
      },
    }),
  ],
});
