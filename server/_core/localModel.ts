import { isIP } from "node:net";

export type LocalChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class LocalModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalModelError";
  }
}

const DEFAULT_MODEL = "qwen3.5:9b";
const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isPrivateIpv4(host: string) {
  const [a, b] = host.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isLocalInferenceHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "ollama" ||
    host === "host.docker.internal"
  )
    return true;
  const version = isIP(host);
  if (version === 4) return isPrivateIpv4(host);
  if (version === 6)
    return (
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab][0-9a-f]/.test(host)
    );
  return false;
}

export function getConfiguredModelName() {
  const model = (process.env.OLLAMA_MODEL || DEFAULT_MODEL).trim();
  if (!MODEL_NAME_PATTERN.test(model)) {
    throw new LocalModelError(
      "OLLAMA_MODEL must be a simple local model tag, such as qwen3.5:9b."
    );
  }
  return model;
}

function localEndpoint(path: "api/chat" | "api/tags") {
  const configuredBase = (
    process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL
  ).trim();
  let base: URL;
  try {
    base = new URL(configuredBase);
  } catch {
    throw new LocalModelError(
      "OLLAMA_BASE_URL must be a valid local Ollama URL. Check LOCAL_AI.md."
    );
  }

  if (
    (base.protocol !== "http:" && base.protocol !== "https:") ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new LocalModelError(
      "OLLAMA_BASE_URL must be an HTTP(S) base URL without credentials, query, or fragment."
    );
  }
  if (!isLocalInferenceHost(base.hostname)) {
    throw new LocalModelError(
      "OLLAMA_BASE_URL must target localhost, the Docker Compose ollama service, or a private-network IP. Public inference hosts are rejected to keep prompts local."
    );
  }

  return `${base.toString().replace(/\/+$/, "")}/${path}`;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

const localOfflineMessage =
  "VMTech's local AI is not reachable. Start the local stack with `docker compose up -d`, then see LOCAL_AI.md in the project folder.";

export async function getLocalModelStatus() {
  let model: string;
  try {
    model = getConfiguredModelName();
    const response = await fetch(localEndpoint("api/tags"), {
      redirect: "error",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return { online: false, installed: false, model };

    const payload = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const installed =
      Array.isArray(payload.models) &&
      payload.models.some(item => item.name === model);
    return { online: true, installed, model };
  } catch {
    return {
      online: false,
      installed: false,
      model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
    };
  }
}

export async function generateWithLocalModel(messages: LocalChatMessage[]) {
  const model = getConfiguredModelName();
  const timeoutMs = boundedInteger(
    process.env.OLLAMA_TIMEOUT_MS,
    300_000,
    5_000,
    900_000
  );
  const numCtx = boundedInteger(
    process.env.OLLAMA_NUM_CTX,
    8_192,
    2_048,
    32_768
  );
  const numPredict = boundedInteger(
    process.env.OLLAMA_NUM_PREDICT,
    2_048,
    128,
    8_192
  );

  let response: Response;
  try {
    response = await fetch(localEndpoint("api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "error",
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: false,
        options: {
          num_ctx: numCtx,
          num_predict: numPredict,
          temperature: 0.35,
          top_p: 0.9,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof LocalModelError) throw error;
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new LocalModelError(
        "The local model took too long to answer. Try a smaller model such as qwen3.5:4b or reduce its context in .env."
      );
    }
    throw new LocalModelError(localOfflineMessage);
  }

  if (response.status === 404) {
    throw new LocalModelError(
      `The local model “${model}” is not downloaded. Run: docker compose exec ollama ollama pull ${model}`
    );
  }
  if (!response.ok) {
    throw new LocalModelError(
      `The local model returned HTTP ${response.status}. Check that Ollama is running and retry.`
    );
  }

  let payload: { message?: { content?: unknown } };
  try {
    payload = (await response.json()) as { message?: { content?: unknown } };
  } catch {
    throw new LocalModelError(
      "The local model returned an unreadable response. Check the Ollama logs and retry."
    );
  }

  const content = payload.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new LocalModelError(
      "The local model returned an empty response. Try again or select a different local model."
    );
  }
  return content.trim();
}
