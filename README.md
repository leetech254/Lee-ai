# VMTech AI

VMTech AI helps with workflow automation drafts, code debugging, teaching, learning plans, project plans, and general questions. It runs open-weight Qwen 3.5 models through a local/private Ollama service; prompts are not sent to a third-party cloud AI provider, and no AI-provider API key is required.

## Run locally

1. Install Docker Desktop or Docker Engine with Compose v2.
2. Copy `.env.example` to `.env` and adjust `OLLAMA_MODEL` if needed.
3. Run `docker compose up --build -d`.
4. Download the selected model, e.g. `docker compose exec ollama ollama pull qwen3.5:9b`.
5. Open `http://localhost:3000`.

The first model download requires internet access; later inference is handled by the local Ollama service. The default stack binds the app to loopback and does not publish Ollama's port. Read [LOCAL_AI.md](LOCAL_AI.md) for hardware choices, GPU setup, configuration, privacy boundaries, and shutdown commands.

## Development and checks

- `pnpm dev`: local development server, bound to loopback unless `HOST` is explicitly set.
- `pnpm check`: TypeScript diagnostics.
- `pnpm test`: unit and integration tests.
- `pnpm build`: production frontend and server build.
- `pnpm start`: serve the built app, bound to loopback unless `HOST` is explicitly set.
