# VMTech AI — local AI setup

VMTech runs its language model on your own machine using [Ollama](https://ollama.com/). The web app talks to Ollama over a private Docker network. There is no cloud AI provider, model API key, or hosted inference fallback. Model downloads happen once during setup; prompts are sent to the local Ollama container for inference.

The Manus Preview used to demonstrate the project runs in its own sandbox; it is not running on your Android phone. The Compose setup below is what moves both the app and model to a machine you control.

This project uses an existing open-weight model; it does not train a foundation model from scratch. The default quality-first choice is Qwen 3.5 9B. The official Ollama model catalogue lists its download at about **6.6–7.6 GB**; Qwen 3.5 4B is a lighter alternative at about **3.3–4.0 GB**. Those are model download sizes, not the total RAM needed while generating. Generation speed and memory use depend on your machine, context size, and GPU. Use the 4B option if the 9B model is too slow or does not fit. See the [Ollama model catalogue](https://ollama.com/library/qwen3.5), [Ollama memory/concurrency FAQ](https://docs.ollama.com/faq), and [Qwen model card/license](https://huggingface.co/Qwen/Qwen3.5-9B) (Apache-2.0).

## Start on your own computer

Install Docker Desktop (Windows/macOS) or Docker Engine plus Docker Compose v2 (Linux), then open a terminal in the VMTech project folder.

1. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`). You may keep the defaults or change `OLLAMA_MODEL` to `qwen3.5:4b`.
2. Build and start the local app and model runtime:

   ```sh
   docker compose up --build -d
   ```

3. Download the selected model into the persistent Ollama volume. For the default:

   ```sh
   docker compose exec ollama ollama pull qwen3.5:9b
   ```

   If you chose the smaller model, run `docker compose exec ollama ollama pull qwen3.5:4b` instead. The initial download needs internet access and several gigabytes of disk space. Wait for the pull command to finish.

4. Visit **http://localhost:3000**. The local-model status in the sidebar should report **Local model ready**. If it still says the runtime is offline, check `docker compose ps` and `docker compose logs ollama`.

The default stack runs on CPU. Optional NVIDIA acceleration is available on a host configured for GPU-enabled Docker (NVIDIA drivers and Container Toolkit on supported Linux/WSL2 setups):

```sh
docker compose -f compose.yaml -f compose.nvidia.yaml up --build -d
```

GPU availability depends on the host's Docker runtime. Docker Desktop on macOS does not provide GPU passthrough to the Ollama container; the CPU stack still works, usually more slowly.

Ollama's port 11434 is intentionally not published to the host or internet. The app binds to `127.0.0.1` by default so it is only accessible on the same computer. A phone cannot use the host computer's `localhost` address directly. VMTech does not currently include a login screen; for Android or other remote-device access, keep the app on a private host and put it behind an authenticated private-network gateway or HTTPS reverse proxy. Do not expose the app to a public network without authentication.

## Update, inspect, and stop

- Follow logs: `docker compose logs -f vmtech ollama`
- List local models: `docker compose exec ollama ollama list`
- Stop services but keep model files: `docker compose down`
- Start again: `docker compose up -d`
- Remove containers **and downloaded model weights**: `docker compose down -v` (destructive; only do this if you intend to delete the local models).

The `ollama-models` named volume keeps model weights across container restarts. Application prompts and responses are processed by the locally running model; chat content is not stored in a hosted VMTech database.

## Configure the runtime

`.env.example` contains these local settings:

- `OLLAMA_MODEL`: local tag, default `qwen3.5:9b`.
- `OLLAMA_NUM_CTX`: context token budget, default `8192`. Larger contexts use more memory.
- `OLLAMA_NUM_PREDICT`: maximum generated token budget, default `2048`.
- `OLLAMA_TIMEOUT_MS`: inference timeout, default `300000` (five minutes).
- `VMTECH_PORT`: browser-facing local port, default `3000`.

For a development setup where Ollama is already installed and running on the same host, set `OLLAMA_BASE_URL=http://127.0.0.1:11434` in the Node server environment. The app rejects public inference hosts; it permits loopback, Docker Compose's `ollama` service, and private-network IPs only. Docker Compose sets the app's runtime address internally to `http://ollama:11434`.
