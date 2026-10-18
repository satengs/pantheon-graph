import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Guard unit tests only (tests/guard/*.test.ts). Separate from vite.config.ts so the
// TanStack Start / Nitro plugins never load in the test runner.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/guard/**/*.test.ts"],
    environment: "node",
  },
});
