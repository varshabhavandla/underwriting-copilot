import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/db/global-setup.ts"],
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
