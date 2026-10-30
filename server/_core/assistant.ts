import { isIP } from "node:net";
import { z } from "zod";
import {
  getConfiguredModelName,
  getLocalModelStatus,
  localEndpoint,
  LocalModelError,
  type LeeModelProfile,
  type LocalChatMessage,
} from "./localModel";

export const assistantMessageListSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(18000),
    })
  )
  .min(1)
  .max(12)
  .superRefine((messages, ctx) => {
    if (messages.reduce((n, m) => n + m.content.length, 0) > 18000)
      ctx.addIssue({
        code: "custom",
        message: "Please keep the full conversation under 18,000 characters.",
      });
  });
const windowMs = 60_000,
  limit = 20;
const rates = new Map<string, { startedAt: number; count: number }>();
export function consumeAssistantRateLimit(id: string, now = Date.now()) {
  const cur = rates.get(id);
  if (cur && now - cur.startedAt < windowMs) {
    if (cur.count >= limit) return false;
    cur.count++;
    return true;
  }
  if (rates.size >= 5000) {
    for (const [k, v] of rates)
      if (now - v.startedAt >= windowMs) rates.delete(k);
    if (rates.size >= 5000) return false;
  }
  rates.set(id, { startedAt: now, count: 1 });
  return true;
}
export type ProviderInput =
  | { provider: "ollama" }
  | {
      provider: "openai-compatible";
      baseUrl: string;
      model: string;
      apiKey: string;
      allowPrivate?: boolean;
    };
type ActiveProvider = ProviderInput;
let active: ActiveProvider = { provider: "ollama" };
export const providerSettingsEnabled = () =>
  process.env.VMTECH_ALLOW_PROVIDER_SETTINGS === "true";
export function initializeAssistantProvider(env = process.env) {
  const provider = env.VMTECH_AI_PROVIDER?.trim() || "ollama";
  if (provider === "ollama") {
    active = { provider: "ollama" };
    return;
  }
  if (provider !== "openai-compatible")
    throw new Error("VMTECH_AI_PROVIDER must be ollama or openai-compatible.");
  if (
    !env.VMTECH_OPENAI_BASE_URL ||
    !env.VMTECH_OPENAI_MODEL ||
    !env.VMTECH_OPENAI_API_KEY
  )
    throw new Error(
      "OpenAI-compatible inference requires VMTECH_OPENAI_BASE_URL, VMTECH_OPENAI_MODEL, and VMTECH_OPENAI_API_KEY."
    );
  const parsed = validateProviderInput({
    provider,
    baseUrl: env.VMTECH_OPENAI_BASE_URL,
    model: env.VMTECH_OPENAI_MODEL,
    apiKey: env.VMTECH_OPENAI_API_KEY,
  });
  if (
    parsed.provider !== "openai-compatible" ||
    new URL(parsed.baseUrl).protocol !== "https:"
  )
    throw new Error(
      "The configured public OpenAI-compatible endpoint must use HTTPS."
    );
  active = {
    ...parsed,
    baseUrl: new URL(parsed.baseUrl).toString().replace(/\/$/, ""),
  };
}
export function isSameOriginMutation(
  origin: string | undefined,
  host: string | undefined,
  protocol: string,
  forwardedHost?: string,
  forwardedProtocol?: string
) {
  if (!origin) return false;
  const effectiveHost = forwardedHost?.split(",")[0]?.trim() || host;
  const effectiveProtocol =
    forwardedProtocol?.split(",")[0]?.trim() || protocol;
  if (!effectiveHost || !["http", "https"].includes(effectiveProtocol))
    return false;
  try {
    return new URL(origin).origin === `${effectiveProtocol}://${effectiveHost}`;
  } catch {
    return false;
  }
}
function privateHost(hostname: string) {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (
    h === "host.docker.internal" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    !h.includes(".")
  )
    return true;
  if (isIP(h) === 4) {
    const [a, b, c] = h.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b <= 2 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (isIP(h) === 6)
    return (
      h === "::" ||
      h === "::1" ||
      h.startsWith("::ffff:") ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("2001:db8:") ||
      h.startsWith("2001:10:") ||
      /^fe[89ab]/.test(h)
    );
  return false;
}
export function validateProviderInput(value: unknown): ProviderInput {
  const parsed = z
    .discriminatedUnion("provider", [
      z.object({ provider: z.literal("ollama") }).strict(),
      z
        .object({
          provider: z.literal("openai-compatible"),
          baseUrl: z.string().trim().url().max(2048),
          model: z.string().trim().min(1).max(128),
          apiKey: z.string().max(4096).default(""),
          allowPrivate: z.boolean().default(false),
        })
        .strict(),
    ])
    .safeParse(value);
  if (!parsed.success) throw new Error("Invalid provider settings.");
  if (parsed.data.provider === "ollama") return parsed.data;
  const u = new URL(parsed.data.baseUrl);
  if (u.username || u.password || u.search || u.hash)
    throw new Error(
      "The provider URL cannot include credentials, query, or fragment data."
    );
  const privateAddress = privateHost(u.hostname);
  const allowPrivate = parsed.data.allowPrivate ?? false;
  if (privateAddress && !allowPrivate)
    throw new Error(
      "Enable private endpoint trust only if this is a provider you control on your device or private network."
    );
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && privateAddress && allowPrivate)
  )
    throw new Error(
      "Use HTTPS for public providers. HTTP is permitted only for a trusted private endpoint."
    );
  return parsed.data;
}
export function getProviderMetadata() {
  return active.provider === "ollama"
    ? {
        enabled: true,
        provider: "ollama" as const,
        model: getConfiguredModelName(),
        configured: true,
      }
    : {
        enabled: true,
        provider: "openai-compatible" as const,
        model: active.model,
        baseUrl: active.baseUrl,
        allowPrivateEndpoint: active.allowPrivate ?? false,
        configured: Boolean(active.apiKey),
      };
}
function retainExistingKey(input: ProviderInput): ProviderInput {
  if (input.provider === "ollama" || input.apiKey) return input;
  if (
    active.provider === "openai-compatible" &&
    active.baseUrl === new URL(input.baseUrl).toString().replace(/\/$/, "") &&
    active.model === input.model &&
    (active.allowPrivate ?? false) === (input.allowPrivate ?? false)
  )
    return { ...input, apiKey: active.apiKey };
  throw new Error("Enter an API key before saving or testing this provider.");
}
export function setProvider(input: ProviderInput) {
  const resolved = retainExistingKey(input);
  active =
    resolved.provider === "ollama"
      ? resolved
      : {
          ...resolved,
          baseUrl: new URL(resolved.baseUrl).toString().replace(/\/$/, ""),
        };
  return getProviderMetadata();
}
export function providerSettingsDisabledMetadata() {
  return active.provider === "ollama"
    ? {
        enabled: false,
        provider: "ollama" as const,
        model: getConfiguredModelName(),
        configured: true,
      }
    : {
        enabled: false,
        provider: "openai-compatible" as const,
        model: active.model,
        configured: Boolean(active.apiKey),
      };
}
export async function testProvider(input: ProviderInput) {
  if (input.provider === "ollama") {
    const status = await getLocalModelStatus();
    if (status.online && status.installed) return { ok: true as const };
    return {
      ok: false as const,
      error: status.online
        ? `Model ${status.model} is not downloaded.`
        : "Local Ollama is not reachable.",
    };
  }
  const candidate = retainExistingKey(input);
  if (candidate.provider !== "openai-compatible")
    return { ok: false as const, error: "Invalid provider selection." };
  try {
    const r = await fetch(
      `${new URL(candidate.baseUrl).toString().replace(/\/$/, "")}/models`,
      {
        headers: { Authorization: `Bearer ${candidate.apiKey}` },
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!r.ok)
      return {
        ok: false as const,
        error: `Provider returned HTTP ${r.status}.`,
      };
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error:
        "Could not reach the provider. Check the URL, TLS certificate, and network access.",
    };
  }
}
function num(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function keepAliveDuration(value: string | undefined) {
  const candidate = value?.trim() || "30m";
  return /^(?:-1|0|[1-9]\d*(?:ms|s|m|h))$/i.test(candidate) ? candidate : "30m";
}
export async function streamAssistant(
  messages: LocalChatMessage[],
  signal: AbortSignal,
  onToken: (token: string) => void,
  profile: LeeModelProfile = "lee-1.0"
) {
  const p = active;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(
    abort,
    num(process.env.OLLAMA_TIMEOUT_MS, 300000, 5000, 900000)
  );
  try {
    const ollama = p.provider === "ollama";
    const url = ollama
      ? localEndpoint("api/chat")
      : p.baseUrl + "/chat/completions";
    const body = ollama
      ? {
          model: getConfiguredModelName(profile),
          messages,
          keep_alive: keepAliveDuration(process.env.OLLAMA_KEEP_ALIVE),
          stream: true,
          think: false,
          options: {
            num_ctx: num(process.env.OLLAMA_NUM_CTX, 6144, 2048, 32768),
            num_predict: num(process.env.OLLAMA_NUM_PREDICT, 1024, 128, 8192),
            temperature: 0.35,
            top_p: 0.9,
          },
        }
      : {
          model: p.model,
          messages,
          stream: true,
          max_tokens: num(process.env.OLLAMA_NUM_PREDICT, 1024, 128, 8192),
          temperature: 0.35,
        };
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ollama
          ? {}
          : {
              Authorization: `Bearer ${(p as Extract<ActiveProvider, { provider: "openai-compatible" }>).apiKey}`,
            }),
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: controller.signal,
    });
    if (ollama && r.status === 404)
      throw new LocalModelError(
        `The selected local model “${getConfiguredModelName(profile)}” is not downloaded. Run “ollama pull ${getConfiguredModelName(profile)}” on the model host, or “docker compose exec ollama ollama pull ${getConfiguredModelName(profile)}” from the VMTech project folder.`
      );
    if (!r.ok || !r.body)
      throw new LocalModelError(
        ollama
          ? `The local model returned HTTP ${r.status}. Check that Ollama is running and retry.`
          : `The configured provider returned HTTP ${r.status}.`
      );
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "";
    const processLine = (line: string) => {
      const text = line.trim();
      if (!text) return;
      if (ollama) {
        let item: any;
        try {
          item = JSON.parse(text);
        } catch {
          return;
        }
        const t = item.message?.content;
        if (typeof t === "string" && t) onToken(t);
        if (item.error)
          throw new LocalModelError("Local inference returned an error.");
      } else {
        const data = text.startsWith("data:") ? text.slice(5).trim() : "";
        if (!data || data === "[DONE]") return;
        let item: any;
        try {
          item = JSON.parse(data);
        } catch {
          return;
        }
        const t = item.choices?.[0]?.delta?.content;
        if (typeof t === "string" && t) onToken(t);
        if (item.error)
          throw new LocalModelError(
            "The configured provider returned an error."
          );
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) processLine(buffer);
  } catch (e) {
    if (signal.aborted) return;
    if (e instanceof LocalModelError) throw e;
    throw new LocalModelError(
      p.provider === "ollama"
        ? "Local inference is unavailable. Check the local model service and retry."
        : "The configured provider could not complete this request."
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
export async function generateWithProvider(
  messages: LocalChatMessage[],
  profile: LeeModelProfile = "lee-1.0"
) {
  let content = "";
  await streamAssistant(
    messages,
    new AbortController().signal,
    token => {
      content += token;
    },
    profile
  );
  if (!content.trim())
    throw new LocalModelError(
      "The model returned an empty response. Try again."
    );
  return content.trim();
}
