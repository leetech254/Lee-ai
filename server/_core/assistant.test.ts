import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assistantMessageListSchema,
  getProviderMetadata,
  isSameOriginMutation,
  setProvider,
  testProvider,
  validateProviderInput,
  streamAssistant,
} from "./assistant";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setProvider({ provider: "ollama" });
});

describe("assistant provider controls", () => {
  it("allows same-origin provider settings only", () => {
    expect(
      isSameOriginMutation("http://localhost:3000", "localhost:3000", "http")
    ).toBe(true);
    expect(
      isSameOriginMutation("https://evil.example", "localhost:3000", "http")
    ).toBe(false);
    expect(
      isSameOriginMutation(
        "https://vmtech.example",
        "internal",
        "http",
        "vmtech.example",
        "https"
      )
    ).toBe(true);
    expect(
      isSameOriginMutation("not-an-origin", "localhost:3000", "http")
    ).toBe(false);
    expect(isSameOriginMutation(undefined, "localhost:3000", "http")).toBe(
      false
    );
  });
  it("requires explicit trust for private endpoints and HTTPS for public providers", () => {
    expect(() =>
      validateProviderInput({
        provider: "openai-compatible",
        baseUrl: "http://example.com/v1",
        model: "m",
        apiKey: "secret",
      })
    ).toThrow(/HTTPS/);
    expect(() =>
      validateProviderInput({
        provider: "openai-compatible",
        baseUrl: "https://127.0.0.1:8000/v1",
        model: "m",
        apiKey: "secret",
      })
    ).toThrow(/private endpoint trust/);
    for (const baseUrl of [
      "https://0.0.0.0/v1",
      "https://[::ffff:127.0.0.1]:8000/v1",
    ])
      expect(() =>
        validateProviderInput({
          provider: "openai-compatible",
          baseUrl,
          model: "m",
          apiKey: "secret",
        })
      ).toThrow(/private endpoint trust/);
    expect(
      validateProviderInput({
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:8000/v1",
        model: "m",
        apiKey: "secret",
        allowPrivate: true,
      }).provider
    ).toBe("openai-compatible");
    expect(() =>
      validateProviderInput({
        provider: "openai-compatible",
        baseUrl: "http://provider.example/v1",
        model: "m",
        apiKey: "secret",
        allowPrivate: true,
      })
    ).toThrow(/HTTPS/);
  });
  it("never exposes keys in provider metadata", () => {
    setProvider({
      provider: "openai-compatible",
      baseUrl: "https://provider.example/v1",
      model: "m",
      apiKey: "never-return-this",
    });
    expect(JSON.stringify(getProviderMetadata())).not.toContain(
      "never-return-this"
    );
  });
  it("reuses an unchanged server-held key without exposing it", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", request);
    const settings = {
      provider: "openai-compatible" as const,
      baseUrl: "https://provider.example/v1",
      model: "m",
      apiKey: "server-only-key",
    };
    setProvider(settings);
    const withoutKey = { ...settings, apiKey: "" };
    expect(await testProvider(withoutKey)).toEqual({ ok: true });
    expect(request.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer server-only-key",
    });
    const saved = setProvider(withoutKey);
    expect(saved).toMatchObject({
      configured: true,
      baseUrl: "https://provider.example/v1",
    });
    expect(JSON.stringify(saved)).not.toContain("server-only-key");
  });
  it("returns safe errors for provider test failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("secret leaked in raw error"))
    );
    const result = await testProvider({
      provider: "openai-compatible",
      baseUrl: "https://provider.example/v1",
      model: "m",
      apiKey: "secret",
    });
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("rejects a public Ollama host without making a network request", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "https://public.example/v1");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(
      streamAssistant(
        [{ role: "user", content: "private prompt" }],
        new AbortController().signal,
        () => undefined
      )
    ).rejects.toThrow(/Public inference hosts/);
    expect(request).not.toHaveBeenCalled();
  });
  it("reports the selected Lee model's pull command without falling back", async () => {
    vi.stubEnv("VMTECH_LEE_2_LITE_MODEL", "qwen3.5:9b");
    const request = vi
      .fn()
      .mockResolvedValue(new Response("model not found", { status: 404 }));
    vi.stubGlobal("fetch", request);
    await expect(
      streamAssistant(
        [{ role: "user", content: "Draft an automation." }],
        new AbortController().signal,
        () => undefined,
        "lee-2.0-lite"
      )
    ).rejects.toThrow("ollama pull qwen3.5:9b");
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(request.mock.calls[0][1].body)).model).toBe(
      "qwen3.5:9b"
    );
  });
  it("accepts one attached-code message and rejects an oversized conversation", () => {
    expect(
      assistantMessageListSchema.safeParse([
        { role: "user", content: "x".repeat(17_000) },
      ]).success
    ).toBe(true);
    expect(
      assistantMessageListSchema.safeParse([
        { role: "user", content: "x".repeat(10_000) },
        { role: "assistant", content: "y".repeat(9_000) },
      ]).success
    ).toBe(false);
  });
  it("streams Ollama NDJSON token content", async () => {
    vi.stubEnv("OLLAMA_MODEL", "qwen3.5:4b");
    vi.stubEnv("VMTECH_LEE_2_PRO_MODEL", "qwen3.5:27b");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(
          encoder.encode(
            '{"message":{"content":"Hi"},"done":false}\n{"message":{"content":"!"},"done":true}'
          )
        );
        c.close();
      },
    });
    const request = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", request);
    const tokens: string[] = [];
    await streamAssistant(
      [{ role: "user", content: "hi" }],
      new AbortController().signal,
      t => tokens.push(t),
      "lee-2.0-pro"
    );
    expect(tokens).toEqual(["Hi", "!"]);
    const init = request.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "qwen3.5:27b",
      keep_alive: "30m",
    });
  });
});
