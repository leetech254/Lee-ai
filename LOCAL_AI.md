# VMTech AI — local and API provider setup

VMTech's default provider is a Qwen 3.5 model served by Ollama on the same computer/server as the app. It uses no AI-provider key or hosted inference by default. The starter model is `qwen3.5:4b` for quicker responses on modest hardware; `qwen3.5:9b` is a stronger but slower/larger option. The official [Ollama model catalogue](https://ollama.com/library/qwen3.5) lists approximate downloads of 3.3–4.0 GB for 4B and 6.6–7.6 GB for 9B. These are model-file sizes, not total runtime RAM. Speed depends on CPU, RAM, context, and GPU. VMTech configures streaming so text can appear before generation is complete; this improves time-to-first-visible-content, not the model's underlying token-generation speed.

This is an existing open-weight model integrated into VMTech; it is not a foundation model trained from scratch. The current Manus Preview runs in a sandbox and is not running on your Android phone. The Compose setup below is the option for running the app and model on a machine you control.

## Run VMTech on your own computer

Install Docker Desktop or Docker Engine with Docker Compose v2, then open a terminal in the VMTech project folder.

1. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`). The default model is `qwen3.5:4b`; change `OLLAMA_MODEL` to `qwen3.5:9b` if you prefer the larger model.
2. Build and start the app and local model service:

   ```sh
   docker compose up --build -d
   ```

3. Download the selected model into Ollama's persistent local volume. For the default:

   ```sh
   docker compose exec ollama ollama pull qwen3.5:4b
   ```

   If you selected 9B, pull that tag instead. The initial download requires internet access and several gigabytes of disk; subsequent inference uses the local service.

4. Open **http://localhost:3000**. The sidebar shows whether the local model is reachable and installed.

The base stack uses CPU and persists model files in the `ollama-models` volume. Optional NVIDIA acceleration is available on compatible hosts with GPU-enabled Docker (NVIDIA drivers and Container Toolkit on supported Linux/WSL2 setups):

```sh
docker compose -f compose.yaml -f compose.nvidia.yaml up --build -d
```

GPU availability depends on the host's Docker runtime. Docker Desktop on macOS does not provide GPU passthrough to Ollama in this setup.

## Optionally use your own OpenAI-compatible API

Local Ollama remains selected until you explicitly change it in **Settings → AI provider**. To protect credentials, the API-key form is disabled in the shared Manus Preview and enabled by default only in the self-hosted Compose setup, whose app port is bound to `127.0.0.1`.

On your self-hosted app, select **OpenAI-compatible**, enter the provider's base URL, model name, and your own API key, then use **Test connection** and **Save provider**. The connection test sends an authenticated `GET /models` request to the endpoint you entered. The API key is held in VMTech server memory for the current process only: it is not returned to the browser, placed in browser storage, logged, or written to disk. A server restart clears it, so re-enter it after restarting. Public providers require HTTPS. Local/private endpoints (HTTP or HTTPS) require checking the explicit private-endpoint trust box; only enable it for a model server you control. Redirects are blocked. If the provider URL and model are unchanged, leave the key field blank to keep using the saved server-side key.

When you explicitly select a remote provider, prompts, recent chat context, and any attached source text are sent to that provider. The provider may apply its own data terms and billing. VMTech does not silently fall back between local and remote providers. Test the provider only if you want that request sent. The settings endpoint is intended for a single-user, loopback-bound instance; disable `VMTECH_ALLOW_PROVIDER_SETTINGS` and use authenticated access controls before sharing the app with other people. VMTech does not currently provide built-in user login.

## Coding, themes, and workflow drafts

In Code Debugger mode, attach plain-text/source files (up to 16,000 characters total); the browser reads them and includes their text in the request without uploading a stored file. If an external API provider is selected, that provider receives the attached text too. Review generated code before running it.

Settings provide Light, Dark, and System appearance modes. Automation mode creates a structured workflow draft that can be downloaded as Markdown; it does not connect accounts, execute a workflow, send messages, or schedule work. To add real automation actions, first decide which services you want connected and how they should be authorized.

## Networking and maintenance

Ollama's port 11434 is not published to the host/internet. The app binds to loopback by default and is available only on the same computer. A phone cannot use the host's `localhost` address directly. For remote-device access, put the app behind an authenticated private-network gateway or HTTPS reverse proxy; never expose this login-free app publicly without authentication.

- Follow logs: `docker compose logs -f vmtech ollama`
- List downloaded models: `docker compose exec ollama ollama list`
- Stop services but keep model files: `docker compose down`
- Start again: `docker compose up -d`
- Delete containers **and downloaded models**: `docker compose down -v` (destructive)

Runtime defaults in `.env.example`:

- `OLLAMA_MODEL`: `qwen3.5:4b` (fast default; use `qwen3.5:9b` for a larger option).
- `OLLAMA_NUM_CTX`: `6144` tokens; a larger context uses more memory.
- `OLLAMA_NUM_PREDICT`: `1024` maximum generated tokens.
- `OLLAMA_TIMEOUT_MS`: `300000` (five minutes).
- `OLLAMA_KEEP_ALIVE`: `30m` keeps the model resident between requests to reduce warm-start latency; lower it if RAM is limited or set `0` to unload promptly.
- `VMTECH_PORT`: browser-facing local port, default `3000`.
- `VMTECH_ALLOW_PROVIDER_SETTINGS`: enabled for the loopback-only Compose instance; disable it on any shared instance without owner-only access.

For Node development with an existing Ollama process on the same computer, set `OLLAMA_BASE_URL=http://127.0.0.1:11434`. The app allows only loopback, Docker's `ollama` service, and private-network inference hosts for Ollama mode; public Ollama endpoints and redirects are rejected. In a Compose deployment the app connects privately to `http://ollama:11434`.
