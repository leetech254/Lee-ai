import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accessApiGate,
  accessStatus,
  initializeAccessAuth,
  login,
  type ACCESS_COOKIE_NAME,
} from "./accessAuth";

afterEach(() => vi.unstubAllEnvs());

describe("site access authentication", () => {
  it("fails closed in production without strong access credentials", () => {
    expect(() =>
      initializeAccessAuth({ NODE_ENV: "production" } as NodeJS.ProcessEnv)
    ).toThrow(/VMTECH_ACCESS_PASSWORD/);
    expect(() =>
      initializeAccessAuth({
        NODE_ENV: "production",
        VMTECH_ACCESS_PASSWORD: "short-password",
        VMTECH_SESSION_SECRET: "s".repeat(32),
      } as NodeJS.ProcessEnv)
    ).toThrow(/16 characters/);
    expect(() =>
      initializeAccessAuth({
        NODE_ENV: "production",
        VMTECH_ACCESS_PASSWORD: " ".repeat(16),
        VMTECH_SESSION_SECRET: "s".repeat(32),
      } as NodeJS.ProcessEnv)
    ).toThrow(/16 characters/);
    expect(() =>
      initializeAccessAuth({
        NODE_ENV: "production",
        VMTECH_ACCESS_PASSWORD: "long-password-value-16",
        VMTECH_SESSION_SECRET: "s".repeat(32),
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("issues a signed session cookie only after same-origin login", () => {
    initializeAccessAuth({
      NODE_ENV: "development",
      VMTECH_ACCESS_PASSWORD: "correct horse battery staple",
      VMTECH_SESSION_SECRET: "s".repeat(32),
    } as NodeJS.ProcessEnv);
    const cookieCalls: unknown[][] = [];
    const req = {
      body: { password: "correct horse battery staple" },
      headers: {},
      ip: "test-client",
      socket: { remoteAddress: "127.0.0.1" },
      protocol: "http",
      get: (name: string) =>
        ({
          origin: "https://public.example",
          host: "internal",
          "x-forwarded-host": "public.example",
          "x-forwarded-proto": "https",
        })[name.toLowerCase()],
    } as any;
    const res = {
      cookie: (...args: unknown[]) => cookieCalls.push(args),
      json: (body: unknown) => body,
      status: (code: number) => ({ json: (body: unknown) => ({ code, body }) }),
    } as any;
    expect(login(req, res)).toEqual({ ok: true });
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.[0]).toBe(
      "vmtech_access" satisfies typeof ACCESS_COOKIE_NAME
    );
    expect(cookieCalls[0]?.[2]).toMatchObject({
      httpOnly: true,
      path: "/",
      secure: true,
      sameSite: "none",
    });
    req.headers.cookie = `${cookieCalls[0]?.[0]}=${cookieCalls[0]?.[1]}`;
    expect(accessStatus(req)).toEqual({ enabled: true, authenticated: true });
  });

  it("rejects oversized guesses and honors explicit public HTTPS cookie mode", () => {
    initializeAccessAuth({
      NODE_ENV: "development",
      VMTECH_ACCESS_PASSWORD: "correct horse battery staple",
      VMTECH_SESSION_SECRET: "s".repeat(32),
    } as NodeJS.ProcessEnv);
    const cookieCalls: unknown[][] = [];
    const req = {
      body: { password: "x".repeat(513) },
      headers: {},
      ip: "oversized-client",
      socket: { remoteAddress: "127.0.0.1" },
      protocol: "http",
      get: (name: string) =>
        ({
          origin: "http://localhost:3000",
          host: "localhost:3000",
        })[name.toLowerCase()],
    } as any;
    const res = {
      cookie: (...args: unknown[]) => cookieCalls.push(args),
      json: (body: unknown) => body,
      status: (code: number) => ({ json: (body: unknown) => ({ code, body }) }),
    } as any;
    expect(login(req, res)).toMatchObject({ code: 401 });
    expect(cookieCalls).toHaveLength(0);

    req.body.password = "correct horse battery staple";
    req.ip = "cookie-client";
    vi.stubEnv("VMTECH_PUBLIC_HTTPS", "true");
    expect(login(req, res)).toEqual({ ok: true });
    expect(cookieCalls[0]?.[2]).toMatchObject({
      secure: true,
      sameSite: "none",
    });
  });

  it("protects assistant APIs while leaving HostKB health public", () => {
    initializeAccessAuth({
      NODE_ENV: "development",
      VMTECH_ACCESS_PASSWORD: "correct horse battery staple",
      VMTECH_SESSION_SECRET: "s".repeat(32),
    } as NodeJS.ProcessEnv);
    let statusCode = 0;
    let nextCalled = false;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        return body;
      },
    } as any;
    const next = () => {
      nextCalled = true;
    };
    accessApiGate(
      { path: "/api/assistant/stream", method: "POST", headers: {} } as any,
      res,
      next as any
    );
    expect(statusCode).toBe(401);
    expect(nextCalled).toBe(false);

    accessApiGate(
      { path: "/api/health", method: "GET", headers: {} } as any,
      res,
      next as any
    );
    expect(nextCalled).toBe(true);
  });

  it("rejects cross-origin mutations even when the session is valid", () => {
    const password = "correct horse battery staple";
    initializeAccessAuth({
      NODE_ENV: "development",
      VMTECH_ACCESS_PASSWORD: password,
      VMTECH_SESSION_SECRET: "s".repeat(32),
    } as NodeJS.ProcessEnv);
    const cookieCalls: unknown[][] = [];
    const loginReq = {
      body: { password },
      headers: {},
      ip: "csrf-login-client",
      socket: { remoteAddress: "127.0.0.1" },
      protocol: "http",
      get: (name: string) =>
        ({
          origin: "https://public.example",
          host: "internal",
          "x-forwarded-host": "public.example",
          "x-forwarded-proto": "https",
        })[name.toLowerCase()],
    } as any;
    const loginRes = {
      cookie: (...args: unknown[]) => cookieCalls.push(args),
      json: (body: unknown) => body,
      status: (code: number) => ({ json: (body: unknown) => ({ code, body }) }),
    } as any;
    login(loginReq, loginRes);
    const cookie = `${cookieCalls[0]?.[0]}=${cookieCalls[0]?.[1]}`;
    const run = (path: string, origin: string) => {
      let statusCode = 0;
      let responseBody: unknown;
      let nextCalled = false;
      const req = {
        path,
        method: "POST",
        headers: { cookie },
        ip: "csrf-client",
        socket: { remoteAddress: "127.0.0.1" },
        protocol: "http",
        get: (name: string) =>
          ({
            origin,
            host: "internal",
            "x-forwarded-host": "public.example",
            "x-forwarded-proto": "https",
          })[name.toLowerCase()],
      } as any;
      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(body: unknown) {
          responseBody = body;
          return body;
        },
      } as any;
      accessApiGate(req, res, () => {
        nextCalled = true;
      });
      return { statusCode, responseBody, nextCalled };
    };

    for (const path of [
      "/api/assistant/stream",
      "/api/trpc/assistant.generate",
    ]) {
      expect(run(path, "https://attacker.example")).toMatchObject({
        statusCode: 403,
        responseBody: { error: "Request rejected." },
        nextCalled: false,
      });
      expect(run(path, "https://public.example").nextCalled).toBe(true);
    }
  });
});
