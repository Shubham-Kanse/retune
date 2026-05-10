import { Hono } from "hono";

export const health = new Hono();

health.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "@retune/api",
    commit: "2",
    features: {
      workbench: true,
      specialists: ["title_schema_retriever", "company_schema_retriever"],
      persistence: false,
      temporal: false,
    },
  });
});
