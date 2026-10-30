import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const ACCESS_COOKIE_NAME = "vmtech_access";
const SESSION_MS = 12 * 60 * 60 * 1000;
type AccessConfig = { enabled: boolean; password?: string; secret?: string };
let config: AccessConfig = { enabled: false };
const attempts = new Map<string, { startedAt: number; count: number }>();
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function initializeAccessAuth(env = process.env) {
  const password = env.VMTECH_ACCESS_PASSWORD;
  const secret = env.VMTECH_SESSION_SECRET;
  if (env.NODE_ENV === "production") {
    if (!password || password.trim().length < 16)
      throw new Error(
        "VMTECH_ACCESS_PASSWORD must be configured with at least 16 characters in production."
      );
    if (!secret || Buffer.byteLength(secret, "utf8") < 32)
      throw new Error(
        "VMTECH_SESSION_SECRET must be configured with at least 32 bytes in production."
      );
  }
  if (!password && !secret) {
    config = { enabled: false };
    return false;
  }
  if (!password || !secret || Buffer.byteLength(secret, "utf8") < 32)
    throw new Error(
      "Configure both VMTECH_ACCESS_PASSWORD and a VMTECH_SESSION_SECRET of at least 32 bytes."
    );
  config = { enabled: true, password, secret };
  return true;
}
export const accessGateEnabled = () => config.enabled;
export function accessStatus(req: Request) {
  return {
    enabled: config.enabled,
    authenticated: config.enabled ? hasValidSession(req) : false,
  };
}
function signature(payload: string) {
  return createHmac("sha256", config.secret!).update(payload).digest();
}
function hasValidSession(req: Request) {
  if (!config.enabled) return false;
  const cookieHeader = req.headers.cookie || "";
  const token = cookieHeader
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith(`${ACCESS_COOKIE_NAME}=`))
    ?.slice(ACCESS_COOKIE_NAME.length + 1);
  if (!token) return false;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra) return false;
  try {
    const expected = signature(payload);
    const supplied = Buffer.from(sig, "base64url");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isSafeInteger(data.exp) && data.exp > Date.now();
  } catch {
    return false;
  }
}
function cookieSecure(req: Request) {
  const forwarded = req
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  return process.env.VMTECH_PUBLIC_HTTPS === "true" || forwarded === "https";
}
function cookieOptions(req: Request) {
  const secure = cookieSecure(req);
  return {
    httpOnly: true,
    path: "/",
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    maxAge: SESSION_MS,
  };
}
export function isSameOriginAccessRequest(req: Request) {
  const origin = req.get("origin");
  if (!origin) return false;
  const host =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const proto =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  if (!host || !["http", "https"].includes(proto)) return false;
  try {
    return new URL(origin).origin === `${proto}://${host}`;
  } catch {
    return false;
  }
}
export function login(req: Request, res: Response) {
  const now = Date.now();
  const id = req.ip || req.socket.remoteAddress || "unknown";
  let entry = attempts.get(id);
  if (attempts.size >= 5000)
    for (const [key, value] of attempts)
      if (now - value.startedAt >= 15 * 60_000) attempts.delete(key);
  if (entry && now - entry.startedAt >= 15 * 60_000) {
    attempts.delete(id);
    entry = undefined;
  }
  if (!entry && attempts.size >= 5000)
    return res.status(429).json({ error: "Login failed." });
  if (entry && entry.count >= 5)
    return res.status(429).json({ error: "Login failed." });
  if (!isSameOriginAccessRequest(req))
    return res.status(403).json({ error: "Request rejected." });
  const provided =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (provided.length > 512) {
    if (!entry) attempts.set(id, (entry = { startedAt: now, count: 0 }));
    entry.count++;
    return res.status(401).json({ error: "Login failed." });
  }
  const expectedDigest = createHmac("sha256", "vmtech-password-check")
    .update(config.password || "")
    .digest();
  const providedDigest = createHmac("sha256", "vmtech-password-check")
    .update(provided)
    .digest();
  const valid =
    config.enabled && timingSafeEqual(expectedDigest, providedDigest);
  if (!valid) {
    if (!entry) attempts.set(id, (entry = { startedAt: now, count: 0 }));
    entry.count++;
    return res.status(401).json({ error: "Login failed." });
  }
  attempts.delete(id);
  const payload = Buffer.from(
    JSON.stringify({ exp: now + SESSION_MS })
  ).toString("base64url");
  res.cookie(
    ACCESS_COOKIE_NAME,
    `${payload}.${signature(payload).toString("base64url")}`,
    cookieOptions(req)
  );
  return res.json({ ok: true });
}
export function logout(req: Request, res: Response) {
  if (!isSameOriginAccessRequest(req))
    return res.status(403).json({ error: "Request rejected." });
  const options = cookieOptions(req);
  res.clearCookie(ACCESS_COOKIE_NAME, { ...options, maxAge: undefined });
  return res.json({ ok: true });
}
export function requireAccess(req: Request, res: Response, next: NextFunction) {
  if (!config.enabled || hasValidSession(req)) return next();
  return res.status(401).json({ error: "Authentication required." });
}
export function accessApiGate(req: Request, res: Response, next: NextFunction) {
  if (!config.enabled || !req.path.startsWith("/api/")) return next();
  if (req.path === "/api/health" && req.method === "GET") return next();
  if (req.path === "/api/access/status" && req.method === "GET") return next();
  if (req.path === "/api/access/login" && req.method === "POST") return next();
  if (!hasValidSession(req)) return requireAccess(req, res, next);
  if (MUTATING_METHODS.has(req.method) && !isSameOriginAccessRequest(req))
    return res.status(403).json({ error: "Request rejected." });
  return next();
}
