# Deploy VMTech AI on HostKB Cloud

`https://hostkb.com/dashboard` is HostKB Cloud's application dashboard. `https://db.hostkb.com/` is the separate managed PostgreSQL/MySQL console. VMTech currently stores no accounts, chat history, or application records, so it does not need that database to run.

## 1. Build and deploy the app

In HostKB Cloud, create an application from GitHub and select `leetech254/Lee-ai`, branch `main`, and the repository root. Use the root `Dockerfile`. It builds the React client and Express server together, exposes port `3000`, binds to `0.0.0.0`, honors the platform-provided `PORT`, and includes an unauthenticated `/api/health` Docker health check. Build the app, then deploy it from the HostKB dashboard. HostKB's docs describe Git-based Docker builds, HTTPS and deployment logs: [Deploy from GitHub](https://hostkb.com/docs/deploy-from-github), [Docker hosting](https://hostkb.com/docs/deploy-docker), and [Node.js hosting](https://hostkb.com/docs/deploy-nodejs).

## 2. Set the public login gate before deployment

Add these values in the HostKB app's **Environment Variables** page and mark both secret values as secrets:

- `VMTECH_ACCESS_PASSWORD`: a strong shared password of at least 16 characters for the app's sign-in screen.
- `VMTECH_SESSION_SECRET`: a separate random value of at least 32 bytes used to sign sessions. Generate with `openssl rand -base64 32`.
- `VMTECH_PUBLIC_HTTPS=true`: tells VMTech to issue a Secure, HttpOnly session cookie with `SameSite=None` for the public HTTPS site.
- `VMTECH_ALLOW_PROVIDER_SETTINGS=false`: prevents visitors from changing the app's shared inference configuration.

The production app refuses to start when the login password or signing secret is missing or too weak. After saving environment variables, build and deploy/redeploy so the running app receives them. The login is a shared site password, not individual accounts; it does not persist per-user data. Login sessions last 12 hours. `/api/health` and the minimal login/status endpoints stay public for HostKB; the rest of the app API requires a valid session. Authenticated state-changing requests also enforce same-origin checks to block cross-site inference or settings changes. All signed-in visitors share the same configured inference provider and billing account; the built-in 20-requests-per-minute-per-IP throttle is an abuse guard, not a provider-spend cap. Only share the password intentionally and configure spending limits with the provider where available.

Keep the GitHub repository free of real passwords, API keys, and `.env` files. Use HostKB's server-side variables UI for secrets; follow its [environment variables guide](https://hostkb.com/docs/environment-variables).

## 3. Choose an inference provider

HostKB's application container is separate from the local Ollama Compose stack. Do not expect the local `ollama` Compose service or downloaded model volume to appear automatically in a HostKB app. Configure one of these options:

**Recommended for a managed app:** use an OpenAI-compatible provider endpoint over HTTPS. Set `VMTECH_AI_PROVIDER=openai-compatible`, `VMTECH_OPENAI_BASE_URL` (for example an endpoint ending in `/v1`), `VMTECH_OPENAI_MODEL`, and `VMTECH_OPENAI_API_KEY` in HostKB's environment variables. Mark the API key as secret. VMTech uses the key server-side and does not return it to the browser. The external provider processes prompts and attached source text, so review its privacy and billing terms. Do not set `VMTECH_ALLOW_PROVIDER_SETTINGS=true` for a public app.

**Private Ollama service:** set `VMTECH_AI_PROVIDER=ollama` and `OLLAMA_BASE_URL` only if you have an Ollama service reachable from the HostKB app over a private network. The app rejects public Ollama URLs and redirects. HostKB's public docs describe Docker app deployment but do not establish that a separate Ollama service, private service network, GPU, or persistent model volume is included; confirm those capabilities with HostKB before choosing this route. The 9B and 27B Qwen tags need substantial disk and memory. Inference speed depends on the model host.

Without a configured hosted inference service, a HostKB container cannot use the Ollama service running on your laptop or phone. Keep running the full local stack with `docker compose up -d` only when the app and Ollama are on the same machine/private Compose network.

## 4. Configure and test

After deployment, open the HostKB HTTPS app URL and sign in with the shared password. Check `/api/health` returns `{"status":"ok"}`. Ask a short question and confirm a streamed answer arrives. If provider settings are unavailable, verify the environment variable values in HostKB and redeploy. Do not expose the app publicly before setting the login password, signing secret, and a valid inference provider.

HostKB provides [app sizing](https://hostkb.com/docs/app-sizes) and [custom domain / HTTPS setup](https://hostkb.com/docs/custom-domains); capacity and any plan-specific limits are controlled by the HostKB dashboard.
