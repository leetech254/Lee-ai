import "dotenv/config";
import express, { type Request } from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, buildSystemPrompt } from "../routers";
import { createContext } from "./context";
import {
  assistantMessageListSchema,
  consumeAssistantRateLimit,
  getProviderMetadata,
  isSameOriginMutation,
  providerSettingsDisabledMetadata,
  providerSettingsEnabled,
  setProvider,
  testProvider,
  validateProviderInput,
  streamAssistant,
} from "./assistant";
import { LEE_MODEL_PROFILE_IDS } from "./localModel";
import { z } from "zod";
import { serveStatic, setupVite } from "./vite";
import {
  accessApiGate,
  accessGateEnabled,
  isSameOriginAccessRequest,
  accessStatus,
  initializeAccessAuth,
  login as accessLogin,
  logout as accessLogout,
} from "./accessAuth";
import { initializeAssistantProvider } from "./assistant";

function sameOriginSettingsRequest(req: Request) {
  return isSameOriginMutation(
    req.get("origin"),
    req.get("host"),
    req.protocol,
    req.get("x-forwarded-host"),
    req.get("x-forwarded-proto")
  );
}

async function startServer() {
  initializeAccessAuth();
  initializeAssistantProvider();
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);
  app.use(express.json({ limit: "128kb" }));
  app.use(express.urlencoded({ limit: "128kb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/access/status", (req, res) =>
    res.setHeader("Cache-Control", "no-store").json(accessStatus(req))
  );
  app.post("/api/access/login", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isSameOriginAccessRequest(req))
      return res.status(403).json({ error: "Request rejected." });
    if (!accessGateEnabled()) return res.json({ ok: true });
    return accessLogin(req, res);
  });
  app.use(accessApiGate);
  app.post("/api/access/logout", accessLogout);
  const safeProviderMetadata = () =>
    providerSettingsEnabled()
      ? getProviderMetadata()
      : providerSettingsDisabledMetadata();
  app.get("/api/assistant/provider", (_req, res) =>
    res.json(safeProviderMetadata())
  );
  app.post("/api/assistant/provider", (req, res) => {
    if (!providerSettingsEnabled())
      return res.status(403).json({ error: "Provider settings are disabled." });
    if (!sameOriginSettingsRequest(req))
      return res
        .status(403)
        .json({ error: "Cross-origin settings changes are blocked." });
    try {
      res.json(setProvider(validateProviderInput(req.body)));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Invalid provider settings.",
      });
    }
  });
  app.post("/api/assistant/provider/test", async (req, res) => {
    if (!providerSettingsEnabled())
      return res
        .status(403)
        .json({ ok: false, error: "Provider settings are disabled." });
    if (!sameOriginSettingsRequest(req))
      return res.status(403).json({
        ok: false,
        error: "Cross-origin settings changes are blocked.",
      });
    try {
      res.json(await testProvider(validateProviderInput(req.body)));
    } catch (e) {
      res.status(400).json({
        ok: false,
        error: e instanceof Error ? e.message : "Invalid provider settings.",
      });
    }
  });
  app.post("/api/assistant/stream", async (req, res) => {
    const bodySchema = z.object({
      skill: z.enum([
        "automation",
        "code",
        "teach",
        "learning",
        "plans",
        "general",
      ]),
      profile: z.enum(LEE_MODEL_PROFILE_IDS).default("lee-1.0"),
      messages: assistantMessageListSchema,
    });
    const result = bodySchema.safeParse(req.body);
    if (!result.success)
      return res.status(400).json({ error: "Invalid assistant request." });
    const id = req.ip || req.socket.remoteAddress || "unknown";
    if (!consumeAssistantRateLimit(id))
      return res.status(429).json({
        error:
          "You’ve reached the short-term assistant limit. Please wait a minute and try again.",
      });
    const aborter = new AbortController();
    const disconnect = () => aborter.abort();
    req.on("aborted", disconnect);
    res.on("close", () => {
      if (!res.writableEnded) disconnect();
    });
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const event = (name: string, data: object) => {
      if (!res.writableEnded && !aborter.signal.aborted)
        res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      await streamAssistant(
        [
          {
            role: "system",
            content: buildSystemPrompt(result.data.skill, result.data.profile),
          },
          ...result.data.messages,
        ],
        aborter.signal,
        content => event("token", { content }),
        result.data.profile
      );
      if (!aborter.signal.aborted) event("done", {});
    } catch (e) {
      event("error", {
        message: e instanceof Error ? e.message : "Assistant request failed.",
      });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });
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
