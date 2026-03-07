import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // This tells Prisma 7 to look at your Vercel Environment Variables
    url: process.env.DATABASE_URL,
  },
});