import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    // Modules that build queries need a connection string to load; tests only
    // render SQL and never connect.
    env: {
      DATABASE_URL: "postgres://test:test@127.0.0.1:1/test",
      NODE_ENV: "test",
    },
  },
});
