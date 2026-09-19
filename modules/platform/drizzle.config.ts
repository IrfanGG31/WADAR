import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["platform"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://wadar:wadar@localhost:5432/wadar",
  },
});
