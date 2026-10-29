# VMTech AI — implementation plan

## Product scope

Build VMTech AI as a general-purpose AI assistant with purpose-specific skills. A visitor can ask it to generate business automations, debug code, explain and teach a concept, create a learning plan, produce a project or business plan, or answer a general question. The app will be usable without an account in this first version. Responses come from the managed Manus AI chat-completions service through the server; the browser never receives platform credentials. The interface will let users choose a skill, suggest example prompts, submit questions, read formatted responses, and continue a conversation. Conversation state remains in the browser for this MVP; there is no durable account or server-side history.

## Implementation approach

- Keep the existing React + TypeScript + Tailwind + Wouter frontend, Express/tRPC backend, and managed server runtime.
- Add one server-side tRPC assistant procedure that accepts a selected skill and bounded conversation messages, limits message and total input size, applies a conservative in-memory per-client rate limit, builds a carefully scoped system prompt, calls `POST $MANUS_API_URL/v1/chat/completions` with the project-provided `MANUS_API_KEY`, validates the response, and returns useful errors without exposing credentials. Use the platform's default model; do not hardcode or expose a model key.
- Build a responsive assistant workspace with skill navigation for Automations, Code Debugger, Teacher, Learning Plans, Project Plans, and General Assistant; prompt suggestions; chat composer; loading, retryable error and empty states; and Markdown/code-block output. Keep conversation history in client state and provide a new-chat/reset action.
- No external LLM provider, user login, database tables, custom images, or third-party integrations are required for this first version. Do not imply that generated automation is already connected to business systems or running code; present generated results as drafts the user can review and copy.
- Keep routes limited to the existing `/` home experience and `/404`, and publish a matching static `public/manus-routes.json` before starting the development server.

## Project structure

- `client/src/pages/Home.tsx`: main assistant workspace and chat interactions.
- `client/src/index.css`: design tokens, typography, responsive styling, motion and component styles.
- `client/src/App.tsx`: existing route registration, updated only if required.
- `server/routers.ts`: register the assistant tRPC procedure.
- `server/_core/` (existing): preserve the supplied server startup and tRPC context; do not leak service secrets into client configuration.
- `public/manus-routes.json`: declared page routes.
- `plan.md` and `TODO.md`: approved implementation/design decisions and tracked outcomes.

## Design directions considered

- **Warm technical editorial** (probability 0.07): paper-like canvas, ink typography, bright electric-blue controls, and precise product diagrams.
- **Dark terminal cockpit** (probability 0.05): black surfaces, monospace hierarchy, green status signals, and command-center density.
- **Luminous workshop** (probability 0.08): warm off-white workspace, deep graphite text, vivid cobalt accents, and compact modular surfaces.

### Selected: Luminous workshop

- **Design Movement:** Contemporary Swiss-influenced product design with a welcoming maker-studio sensibility.
- **Core Principles:** Make capabilities discoverable; keep generated work readable; reduce the distance between idea and first result; provide calm, direct feedback.
- **Color Philosophy:** An airy warm-white canvas makes long answers comfortable to read; graphite anchors trust; VMTech cobalt marks creation and focus, with subtle periwinkle supporting AI status without resorting to a generic black neon dashboard.
- **Layout Paradigm:** An asymmetric workbench: slim capability rail at left, broad conversational canvas, and context/sample suggestions placed near the composer rather than a centered marketing-page grid.
- **Signature Elements:** A compact “VM” orbit/bolt glyph; cobalt skill chips; a faint drafting-grid motif behind the welcome state.
- **Interaction Philosophy:** Skill selection updates examples and assistant intent immediately; sending shows a clear in-progress state; answers can be copied; retry keeps the user's input intact.
- **Animation:** Brief 140–200 ms transitions for focus, tab and panel changes; restrained loading dots; no parallax or motion that delays reading; respect reduced-motion preferences.
- **Typography System:** Inter for interface and body copy, Manrope for a sturdy display hierarchy, and JetBrains Mono for code and technical metadata. Large, compact welcome headline; comfortably spaced long-form answer text.
- **Brand Essence:** A practical AI workbench that turns open-ended questions into useful next steps for curious people and builders. Personality: capable, clear, encouraging.
- **Brand Voice:** Concrete, energetic, never overclaiming. Example lines: “What are we figuring out?” and “A good first draft, ready to make yours.”
- **Wordmark & Logo:** A custom VM ligature built from two angled strokes and a small spark/node, paired with a compact uppercase VMTECH wordmark and an AI pill.
- **Signature Brand Color:** VMTech cobalt `#4356F5`.

## Constraints and dependencies

The initialized project has the managed server enabled and database disabled. Use the server-side platform API only when its runtime variables are supplied. Show a clear retryable unavailable-service message if the AI endpoint fails; never present placeholder output as a real AI answer. The freeform assistant must set expectations that plans and automations are drafts and that users must review code before execution. Preserve the existing starter and its dependency set unless an actual implementation requirement warrants a change.
