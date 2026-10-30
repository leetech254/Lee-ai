import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWithLocalModel, getLocalModelStatus } from "./localModel";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("local model runtime", () => {
  it("sends one non-streaming request to Ollama and returns the local answer", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3.5:4b");
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: { content: "A local answer." } }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", request);

    await expect(
      generateWithLocalModel([{ role: "user", content: "Explain recursion." }])
    ).resolves.toBe("A local answer.");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/chat");
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      model: "qwen3.5:4b",
      stream: false,
      think: false,
      messages: [{ role: "user", content: "Explain recursion." }],
    });
  });

  it("explains how to install a missing local model without cloud fallback", async () => {
    vi.stubEnv("OLLAMA_MODEL", "qwen3.5:9b");
    const request = vi
      .fn()
      .mockResolvedValue(new Response("model not found", { status: 404 }));
    vi.stubGlobal("fetch", request);

    await expect(
      generateWithLocalModel([{ role: "user", content: "Hello" }])
    ).rejects.toThrow("docker compose exec ollama ollama pull qwen3.5:9b");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("127.0.0.1:11434/api/chat");
  });

  it("reports an offline local runtime and never contacts a remote provider", async () => {
    const request = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.stubGlobal("fetch", request);

    await expect(
      generateWithLocalModel([{ role: "user", content: "Hello" }])
    ).rejects.toThrow("local stack");
    expect(request).toHaveBeenCalledTimes(1);
    expect(await getLocalModelStatus()).toMatchObject({
      online: false,
      installed: false,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects public Ollama endpoints before making a network request", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "https://api.example.com");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(
      generateWithLocalModel([
        { role: "user", content: "Keep this prompt local." },
      ])
    ).rejects.toThrow("Public inference hosts are rejected");
    expect(request).not.toHaveBeenCalled();
  });

  it("allows the private Docker Compose Ollama service name", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama:11434");
    const request = vi
      .fn()
      .mockResolvedValue(new Response("model not found", { status: 404 }));
    vi.stubGlobal("fetch", request);

    await expect(
      generateWithLocalModel([{ role: "user", content: "Hello" }])
    ).rejects.toThrow("not downloaded");
    expect(request.mock.calls[0][0]).toBe("http://ollama:11434/api/chat");
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });
});
