# VMTech AI

A self-hostable, multi-skill AI workbench for automation drafts, code debugging and review, teaching, learning plans, project plans, and general help. Assistant output streams as it arrives. Code mode accepts small text/source attachments; automation mode exports a reviewable Markdown workflow draft. Light, Dark, and System themes are available in Settings.

## Quick start

1. Install Docker Desktop or Docker Engine with Docker Compose v2.
2. Copy `.env.example` to `.env`.
3. Start the app and Ollama service: `docker compose up --build -d`.
4. Pull the default automation profile model: `docker compose exec ollama ollama pull qwen3.5:9b`.
5. Open **http://localhost:3000**.

Choose **Lee 1.0** for fast questions, **Lee 2.0 Lite** for automations and everyday tasks, or **Lee 2.0 Pro** for coding and complex tasks. VMTech uses those names for configurable local Ollama profiles; they are not separate VMTech-trained weights. Defaults map to Qwen 3.5 4B, 9B, and 27B. Pull a profile's tag before selecting it. The 27B tag is a large download and needs substantial memory. Set `VMTECH_LEE_1_MODEL`, `VMTECH_LEE_2_LITE_MODEL`, or `VMTECH_LEE_2_PRO_MODEL` in `.env` to map a profile to a different local Ollama tag. Model downloads require internet; inference uses the local Ollama container by default. See [LOCAL_AI.md](LOCAL_AI.md) for model sizes, GPU setup, provider settings, hardware, privacy, and maintenance.

## Optional API provider

You can explicitly configure an OpenAI-compatible provider in **Settings → AI provider** when running the loopback-bound self-hosted stack. Use your own endpoint, model, and API key. Keys stay in server memory only and are cleared when the server restarts. When a remote provider is selected, the provider receives the prompts and any attached source text. The shared Manus Preview does not accept API keys. Local Ollama stays the default; there is no silent provider fallback.

VMTech produces plans and code drafts; it does not execute code or trigger business automations. Connecting real automation services requires separate integration choices and authorization.

## Development checks

- `pnpm dev`: local development server, bound to loopback unless `HOST` is explicitly set.
- `pnpm check`: TypeScript diagnostics.
- `pnpm test`: unit and integration tests.
- `pnpm build`: production frontend and server build.
- `pnpm start`: serve the built app, bound to loopback unless `HOST` is explicitly set.
