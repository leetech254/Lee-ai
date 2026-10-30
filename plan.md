# VMTech AI — implementation plan (performance and capability update)

## Product scope

Continue VMTech AI as a fast, self-hostable general AI workbench for automation drafting, coding, teaching, plans, and general help. This update prioritizes quicker perceived response, useful code context, structured automation artifacts, optional user-supplied API providers, and a complete theme switch. Local Ollama remains the default; optional remote inference requires the user's explicit provider setup and selection. No provider key is returned to the browser or saved in local storage.

This is still not a model trained by VMTech. Workflows and code are drafts; VMTech must not execute code or trigger external automations until the user identifies and authorizes specific integrations. A broad request for "all Manus AI features" is implemented as this bounded high-value tranche; additional tool connections, web research, schedules, memory, or autonomous actions require concrete scope and permissions.

## Implementation approach

- Keep React + TypeScript, Express/tRPC, and the existing Ollama self-host stack. Preserve the current app and approved visual identity.
- Measure response through the app and local Qwen service. In a matched localhost test using Qwen 3.5 4B and the same short code question/output, a cold request took 10.421 seconds to first token and 11.415 seconds total; repeating it after the model was loaded took 0.162 seconds to first token and 1.323 seconds total (the same 100-character answer). An earlier non-streaming release recorded 12.56 seconds to first response. These are single-run sandbox measurements, not a general hardware guarantee. Forward output using same-origin POST/SSE, parse Ollama NDJSON and OpenAI-compatible SSE server-side, display lightweight plain text while the Markdown chunk loads, and abort when chat resets or the client disconnects. Retain server-side input limits and rate controls.
- Reduce avoidable work with concise per-skill directions, an 18,000-character recent-context budget, and a 1,024-token output cap. Prefer `qwen3.5:4b` for the speed-first local default; document `qwen3.5:9b` as a slower, higher-capability choice. Keep the loaded model in memory for 30 minutes by default to reduce repeated cold starts; allow operators to shorten that duration when RAM is limited. Do not claim streaming accelerates model computation: it makes answer content visible sooner, and a cold model load still takes time.
- Add an optional OpenAI-compatible provider alongside Ollama. Provider configuration comprises base URL, model, and API key. Ollama remains selected by default; a remote provider is used only when the user explicitly selects and saves it. Public endpoints require HTTPS; private endpoints require an explicit trust choice. Disable redirects, reject public/reserved Ollama hosts, never auto-fallback, never log or echo keys, and expose only nonsecret metadata to the client. Provider-save/test POSTs require a matching same-origin `Origin` header. The settings UI is disabled in hosted Preview; the loopback-bound self-hosted Compose app enables it and keeps the key only in server memory for the current process. A blank key can reuse the same saved endpoint/model; changing them requires a new key. Never persist the key to browser storage or disk; document that a server restart clears it. Do not commit real credentials.
- Strengthen coding help with dedicated debug, review, tests, and explanation prompts. Allow a user to attach small plain-text/source files up to 16,000 characters; the browser reads the file and includes its contents in the request without uploading a stored file. Bound prompt plus recent conversation at 18,000 characters and show the selected filename.
- Make automation answers a consistent draft with a goal, trigger, required inputs/permissions, numbered steps, branching, error/retry handling, test plan, rollback/deactivation, and explicitly named external connections. Offer a downloadable Markdown draft. Do not run, schedule, or send anything without a later integration scope and explicit user authorization.
- Add Light, Dark, and System themes, covering the full workspace and saving the preference in browser local storage. No theme preference contains secrets.
- Keep `compose.yaml` as the local deployment path with Ollama private on the Compose network and the app host-bound to loopback. Keep the NVIDIA override optional. The app Preview remains a sandbox for UI/inference demonstration; user API settings remain disabled there.
- Add three selectable local Ollama profiles branded Lee: **Lee 1.0** for fast questions and answers, **Lee 2.0 Lite** for automations and tasks, and **Lee 2.0 Pro** for coding and complex tasks. Recommend Lite for automation/planning skills, Pro for coding, and Lee 1.0 for general/teaching/learning; let the user override the recommendation. These are VMTech profile names, not new trained model weights. Default to real configurable Ollama tags `qwen3.5:4b`, `qwen3.5:9b`, and `qwen3.5:27b`, respectively; disclose the backing tag and expose current readiness/download guidance for the selected profile. Keep remote OpenAI-compatible provider behavior separate. The 27B profile is a large download (official catalog lists 17–20 GB) and may require substantial host memory; do not imply it is installed or suitable for every device.

## Project structure

- `client/src/pages/Home.tsx`: multi-skill assistant, Lee profile picker and skill recommendations, incremental messages, file attachments, draft export, theme state, and settings dialog.
- `client/src/index.css`: the existing Luminous workshop design plus complete light/dark/system themes.
- `server/routers.ts`: validated tRPC procedures, rate limiting, and shared deployment-aware skill prompts.
- `server/_core/localModel.ts`: Lee profile-to-Ollama tag mapping, local generation/status, and endpoint validation.
- `server/_core/assistant.ts`: provider state, key-safe metadata, origin/URL validation, local/OpenAI-compatible streaming, and request budgets.
- `server/_core/index.ts`: same-origin SSE and provider settings/test endpoints, request validation, cancellation, and response headers.
- `server/_core/*test.ts`: provider safety, request-budget, and streaming regression tests.
- `.env.example`, `compose.yaml`, `LOCAL_AI.md`, and `README.md`: safe setup and performance/provider guidance.

## Constraints and source behavior

- User-supplied remote API keys are optional and are never requested in chat. In hosted Preview, provider-key entry stays disabled; users must self-host the loopback-bound app to enter credentials. Keys typed into the self-hosted Settings dialog are memory-only, excluded from API responses/logs, and lost on server restart.
- Public/reserved Ollama endpoints, redirects, cross-origin or origin-less provider-settings mutations, silent provider fallback, and unconfirmed automation execution are prohibited. An explicitly selected OpenAI-compatible provider may be public over HTTPS; private endpoints require operator consent.
- Speed results are single-run local Qwen 3.5 4B sandbox timings; first-run and self-host performance vary with browser, CPU/GPU, memory, context, model, network, and provider. A real Android browser render benchmark was not run.
- Docker is not installed in this sandbox, so Compose can be inspected and formatted here but cannot be exercised end-to-end. The existing local Ollama service validates app-to-model inference.
- The Lee 1.0 Qwen 4B and Lee 2.0 Lite Qwen 9B profiles were both tested through the live SSE endpoint; Lite returned a real automation draft in about 76 seconds on the CPU-only sandbox, while Lee 2.0 Pro's 27B tag was not downloaded. These are environment-specific run observations, not performance guarantees.

## Design (retained and extended)

- **Design directions considered:** Warm technical editorial (0.07), dark terminal cockpit (0.05), luminous workshop (0.08).
- **Selected: Luminous workshop.**
- **Design Movement:** Contemporary Swiss-influenced product design with a welcoming maker-studio sensibility.
- **Core Principles:** Make capabilities discoverable; keep generated work readable; reduce the distance between idea and first result; provide calm, direct feedback.
- **Color Philosophy:** Airy warm-white surfaces support long answers; graphite text anchors trust; VMTech cobalt marks creation and focus. Dark mode uses deep graphite surfaces and softened cobalt contrast for long sessions.
- **Layout Paradigm:** An asymmetric workbench with a slim capability rail, broad conversational canvas, and prompt suggestions near the composer; settings stay in a focused, accessible dialog.
- **Signature Elements:** A compact VM glyph, cobalt skill controls, and subtle drafting-inspired surfaces.
- **Interaction Philosophy:** Show generation as it arrives, clarify active provider, support code-file context, provide workflow draft export, and let people choose themes without hiding controls.
- **Animation:** Brief transitions, restrained loading states, no motion that delays reading, and reduced-motion support.
- **Typography System:** Local/system sans-serif UI typography with a monospace code stack so the app does not need a remote font CDN.
- **Brand Essence:** A practical AI workbench that turns open-ended questions into useful next steps for curious people and builders. Personality: capable, clear, encouraging.
- **Brand Voice:** Concrete, energetic, never overclaiming. Example lines: “What are we figuring out?” and “A good first draft, ready to make yours.”
- **Wordmark & Logo:** Keep the existing custom VM mark and VMTECH wordmark.
- **Signature Brand Color:** VMTech cobalt `#4356F5`.
