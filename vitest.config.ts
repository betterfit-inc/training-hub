import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" -> "src/*" path alias so `@/lib/...`
      // imports resolve in tests. String "@" only matches "@/..." requests,
      // never scoped packages like "@anthropic-ai/sdk".
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
