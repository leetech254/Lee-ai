# VMTech AI — implementation plan

## Product scope

Continue VMTech AI as a general-purpose assistant with skill modes for automation drafting, code debugging, teaching, learning plans, project plans, and general questions. Run model inference locally on the owner's machine or server; do not require a third-party AI provider, API key, or Manus AI service. This is an open-weight foundation model run under the VMTech experience, not a foundation model trained from scratch. Generated workflows and code remain drafts requiring user review; this phase does not execute workflows or run code.

## Implementation approach

- Preserve the existing React + TypeScript frontend and Express/tRPC server, and make the repository independently runnable using Docker Compose.
- Run a dedicated Ollama container beside the app on a private Compose network. The app calls its local `/api/chat` endpoint on that private network, with no API key; never expose Ollama's 11434 port publicly. This local HTTP hop is an internal runtime interface, not a third-party model API.
- Use `qwen3.5:9b` as the quality-first default model, with `qwen3.5:4b` as an explicit lower-memory option. The model weights are downloaded into an Ollama volume once and retained across restarts. First setup requires internet access to download the container image and selected model; text inference thereafter runs locally.
- Read `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `OLLAMA_TIMEOUT_MS` from runtime environment. Restrict inference endpoints to loopback, the Compose `ollama` hostname, or private-network IPs; reject public hosts before sending prompts. Use bounded input and generated output, a single non-streaming chat request, a sufficiently long CPU-friendly timeout, and actionable errors for a missing model or offline local runtime. Never fall back silently to a cloud model.
- Remove live runtime dependency on Manus OAuth, Manus AI API calls, Manus browser configuration, and session-token forwarding. Keep a public local app route without a Manus sign-in requirement. Do not require `MANUS_API_KEY`, `MANUS_API_URL`, `DATABASE_URL`, or `MANUS_OAUTH_*` to start or use the app.
- Use a Compose health check and a local health route for the app. Bind standalone web starts to loopback by default; the Compose container may listen internally on all interfaces only because its host port is explicitly loopback-bound. Document that public access requires authentication and HTTPS.
- Make typography local/system-native so normal app use does not call a remote font service. Keep the existing skill UI, conversation safeguards, rate limits, route manifest, brand, and approved Luminous workshop design.
- Supply `.env.example`, `compose.yaml`, optional `compose.nvidia.yaml`, and `LOCAL_AI.md` with startup instructions, first-time model download, CPU/GPU trade-offs, model selection, persistent weights, and shutdown/update steps. Do not bundle multi-gigabyte model weights into Git or the app image.

## Model and hardware constraints

The official Ollama library currently lists Qwen 3.5 9B at approximately 6.6–7.6 GB and the 4B option at approximately 3.3–4.0 GB, both with a listed 256K context. Ollama's default context is much smaller and RAM use grows with context and concurrent requests, so the self-hosted configuration uses a modest context and one request at a time. Source: [Ollama Qwen 3.5 library](https://ollama.com/library/qwen3.5) and [Ollama FAQ](https://docs.ollama.com/faq). The Qwen model card lists Apache-2.0 licensing: [Qwen3.5-9B model card](https://huggingface.co/Qwen/Qwen3.5-9B).

The current Webdev published container and this development Sandbox have no GPU support suitable for hosting the production model. Webdev Preview remains useful for UI checks but will not be presented as a public, always-on local inference service. The deliverable is a self-hostable Compose application, and a fully working local-model deployment requires Docker/Compose (or Ollama installed locally) plus enough RAM/VRAM for the chosen model. A quantized small model can run on CPU but may be noticeably slower and less capable than larger GPU-backed models.

## Project structure

- `client/src/pages/Home.tsx`: the existing multi-skill assistant workspace, chat interactions, retry and copy controls.
- `client/src/index.css` and `client/index.html`: responsive product design and offline-safe typography/favicon.
- `server/routers.ts`: validated assistant procedure, prompt templates, safe rate limiting, and local-inference error boundaries.
- `server/_core/localModel.ts`: Ollama client for the private local `/api/chat` endpoint; no cloud fallback.
- `server/_core/index.ts`, `context.ts`, and `trpc.ts`: minimal app-owned server setup without mandatory Manus OAuth/session/API calls.
- `compose.yaml`: independently runnable app + Ollama services with a persistent model volume and a private inference network.
- `compose.nvidia.yaml`: optional NVIDIA device reservation for hosts that have configured GPU-enabled Docker.
- `.env.example` and `LOCAL_AI.md`: model selection, startup and operating instructions. The route manifest stays in `client/public/manus-routes.json`.

## Design (retained)

- **Design directions considered:** Warm technical editorial (0.07), dark terminal cockpit (0.05), luminous workshop (0.08).
- **Selected: Luminous workshop.**
- **Design Movement:** Contemporary Swiss-influenced product design with a welcoming maker-studio sensibility.
- **Core Principles:** Make capabilities discoverable; keep generated work readable; reduce the distance between idea and first result; provide calm, direct feedback.
- **Color Philosophy:** Airy warm-white surfaces support long answers; graphite text anchors trust; VMTech cobalt marks creation and focus.
- **Layout Paradigm:** An asymmetric workbench with a slim capability rail, broad conversational canvas, and prompt suggestions near the composer.
- **Signature Elements:** A compact VM glyph, cobalt skill controls, and subtle drafting-inspired surfaces.
- **Interaction Philosophy:** Skill selection updates examples and assistant intent; loading and retry feedback are clear; users can copy answers and start a new chat.
- **Animation:** Brief transitions, restrained loading states, no motion that delays reading, and reduced-motion support.
- **Typography System:** Local/system sans-serif UI typography with a monospace code stack so the app does not need a remote font CDN.
- **Brand Essence:** A practical AI workbench that turns open-ended questions into useful next steps for curious people and builders. Personality: capable, clear, encouraging.
- **Brand Voice:** Concrete, energetic, never overclaiming. Example lines: “What are we figuring out?” and “A good first draft, ready to make yours.”
- **Wordmark & Logo:** Keep the existing custom VM mark and VMTECH wordmark.
- **Signature Brand Color:** VMTech cobalt `#4356F5`.
