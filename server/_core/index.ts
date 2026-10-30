import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "128kb" }));
  app.use(express.urlencoded({ limit: "128kb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  const host = process.env.HOST?.trim() || "127.0.0.1";
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, host, () =>
    console.log(`Server listening on ${host}:${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
