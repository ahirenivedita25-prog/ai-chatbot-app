# AI Chatbot Startup

A full-stack Moonlit assistant with a React/Tailwind client, Express API, and PostgreSQL-backed authentication and conversation logging.

## Quick start

```bash
npm install
npm test
npm run build
npm start
```

The app listens on `http://localhost:3000` by default. For frontend development, run `npm run dev:client` in another terminal; Vite proxies `/api` requests to the Express server.

## Endpoints

- `GET /chat-status`
- `POST /api/school/chat`
- `POST /api/clinic/chat`
- `POST /api/retail/chat`
- `POST /api/restaurant/chat`
- `POST /chat` (authenticated plain-text response; JSON request body)
- `POST /weather`, `POST /location`, `POST /compare` (authenticated tools)

Chat endpoints accept JSON such as `{ "message": "What are your opening hours?" }` and require a valid short-lived access token. The industry-specific endpoints return the existing JSON envelope with a plain-text reply, model version, and conversation ID. `POST /chat` accepts the same body plus an optional `industry` (`school`, `clinic`, `retail`, or `restaurant`, default `school`) and returns the reply as `text/plain`.

- `POST /api/auth/register`, `POST /api/auth/login`
- `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/conversations` (owner-scoped)
- `GET /api/admin/settings`, `GET /api/admin/help`, `GET /api/admin/audit`, `GET /api/admin/conversations`, `GET /api/admin/feedback`, `GET /api/admin/failed-queries` (admin only)
- `POST /api/conversations/:id/feedback` (conversation owner only)

## Configuration

Copy `config/env.example` to `.env` for local development. Set `DATABASE_URL` to enable PostgreSQL persistence. Production startup requires `DATABASE_URL`, a `JWT_SECRET` of at least 32 bytes, a base64-encoded 32-byte `DATA_ENCRYPTION_KEY`, and at least one address in `ADMIN_EMAILS`. Configure `AI_API_KEY` for provider-backed answers. `AI_API_URL` must point to an OpenAI-compatible chat-completions endpoint and `AI_MODEL` selects the provider model ID. `MOONLIT_MODEL_VERSION` is the app-facing version label and accepts `moonlit-brain-v1`, `moonlit-brain-v2`, and later numeric versions. `AI_ASSISTANT_NAME` controls the assistant display identity, not the provider model. Set `OPENWEATHER_KEY` (or the compatible `WEATHER_API_KEY` alias) to enable `/weather`, `/location`, and weather chat lookups. Endpoint URLs can be overridden with `WEATHER_API_URL`, `WEATHER_FORECAST_API_URL`, and `LOCATION_API_URL`. WhatsApp credentials remain optional and are not exposed through a send route or webhook.

### Integrations

Jira, Confluence, and Slack searches use server-side credentials. Set `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`; `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_API_TOKEN`; and a Slack bot token with the `search:read` scope. Admins can search those sources from **Workspace options → Integrations**. Do not expose these credentials to the browser.

Google Drive and OneDrive imports use per-user delegated OAuth. Register these callback URLs with the provider applications (replace the host for local development):

```text
https://ai-chatbot-startup-qet3.onrender.com/api/integrations/google/callback
https://ai-chatbot-startup-qet3.onrender.com/api/integrations/microsoft/callback
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for a Google OAuth web application with the Drive read-only scope enabled. Set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` for a Microsoft Entra app registration with delegated `Files.Read` and `User.Read` permissions and `offline_access`. Tokens are encrypted with `DATA_ENCRYPTION_KEY` and stored per user. Imported files are limited to text, Markdown, CSV, or JSON and 1 MB; existing malware scanning still applies before chat processing. The OAuth callback host must match `APP_BASE_URL` exactly.

## Deploy to Render

This repository includes `render.yaml` for a Render web service. Configure `DATABASE_URL` with the external PostgreSQL provider connection string.

1. Push the repository to GitHub.
2. In Render, choose **New +** and **Blueprint**.
3. Connect the repository containing this Blueprint.
4. Select the branch to deploy and apply the Blueprint.
5. Open the generated `https://...onrender.com/` URL.

The Blueprint builds the React client with `npm ci && npm run build`, starts the Express service with `npm start`, and uses `/chat-status` for health checks. It generates JWT and data-encryption secrets. During initial Blueprint setup, provide `DATABASE_URL`, `ADMIN_EMAILS`, `AI_API_KEY`, `OPENWEATHER_KEY`, and `CLAMAV_HOST`; configure `CLAMAV_PORT` if it differs from 3310. Render's free web service may sleep after inactivity.

For an existing Render Blueprint, values marked `sync: false` may need to be set manually in the service's Environment panel. Keep all credentials out of source control. The Render web service terminates HTTPS; the app rejects non-HTTPS API requests in production.

## Fine-tune Moonlit

The optional training pipeline lives in `training/train.py`; it does not run during the Node app build. It fine-tunes a pretrained causal language model and saves the model/tokenizer to a versioned directory. The default base model is the small `distilgpt2` model, useful for smoke tests; select an appropriately licensed and resourced Hugging Face model for real training. Gated models may need Hugging Face authentication before training. For GPU training, install a PyTorch build matching the machine's CUDA setup.

Prepare UTF-8 JSON with an array of Q&A objects:

```json
[
  {
    "input": "How do I pay school fees?",
    "output": "You can pay through the school portal or contact the finance office."
  },
  {
    "input": "What time does the office open?",
    "output": "The office is open from 8 AM to 4 PM on school days."
  }
]
```

CSV and JSONL are also supported. Preparation normalizes Unicode/whitespace and removes exact Q&A pair duplicates (case-insensitive) before producing seeded splits. It saves `train.json`, `test.json`, and `manifest.json` under `training/prepared/<version>/`; when `--test-data` is supplied, overlapping pairs are excluded from the held-out split. Training tokenizes prompt plus answer, masks prompt tokens from loss, and uses a padding collator. Evaluation reports token accuracy, loss, and derived perplexity. Token accuracy is a basic diagnostic, not a measure of answer quality.

The preprocessing logic in `training/train.py` cleans whitespace and builds answer-only causal-LM labels:

```python
prompts = [f"### User: {clean_text(text)}\n### Assistant:" for text in batch["input"]]
answers = [clean_text(text) for text in batch["output"]]
encoded = tokenizer(
  [f"{prompt} {answer}{tokenizer.eos_token}" for prompt, answer in zip(prompts, answers)],
  truncation=True,
  max_length=max_length,
)
```

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-training.txt
python training/data_prep.py --data data/moonlit-qa.json --output-dir training/prepared/preview --seed 42
python -m training.train --data data/moonlit-qa.json --version 1
```

The prepared splits and manifest are saved under `training/prepared/moonlit-brain-v1/`; model weights, tokenizer, checkpoints, and `moonlit-metadata.json` are saved under `./moonlit-brain-v1`. Prepared data and model outputs are git-ignored. Increment the version without overwriting the previous directory by passing `--version 2` or `--version 3`. For example:

```powershell
python -m training.train --data data/new-reviewed-qa.csv --test-data data/held-out.csv --model-name distilgpt2 --version 2
```

To append a newly reviewed pair, update a JSON dataset explicitly, then prepare and train a new version:

```powershell
python training/add_qa.py --data data/moonlit-qa.json --input "How do I contact admissions?" --output "Contact the admissions office using the details on the school's official website."
python -m training.train --data data/moonlit-qa.json --version 2
python -m unittest training.tests.test_data_prep
```

Training requires `requirements-training.txt` and a model download. The dataset preparation and reviewed-Q&A append utilities use only Python's standard library and can be tested without installing PyTorch or Transformers.

Review feedback at `GET /api/admin/feedback` and failed request metadata at `GET /api/admin/failed-queries`. A human must verify the intended answer, remove identifiers, and obtain appropriate consent before manually appending an example. Do not automatically train on raw conversation history or feedback ratings: they can contain personal or sensitive information and ratings alone are not answers.

Training creates local weights; it does not deploy or host them. To serve a trained model, publish/deploy it to a Hugging Face Inference Endpoint (or another OpenAI-compatible service), then set `AI_API_URL` to its chat-completions URL, `AI_API_KEY` to its secret, and `AI_MODEL` to the provider's actual model ID. Set `MOONLIT_MODEL_VERSION=moonlit-brain-v1` (or the deployed version) so saved chats carry the correct app version. The API uses this existing provider boundary; do not point `AI_MODEL` at the local output directory on Render.

All chat endpoints use JWT authentication, message validation/sanitization, attachment malware scanning, and the existing per-user rate limiter. Successful conversations are encrypted at rest with AES-256-GCM and include user ID, timestamp, and model version metadata. Provider failures are recorded in `failed_queries` with user ID, industry, timestamp, model version, and a fixed error category; failed prompt text is not duplicated in this table. Monitor and retain this metadata under the application's privacy policy.

Weather, temperature, and forecast questions are classified before general AI inference and use the configured weather API. Include a city or location (for example, `weather in Paris`); when none is specified, Moonlit asks for one rather than guessing. Responses show condition, Celsius temperature, humidity, and wind speed as a concise icon-led list. Forecast requests report the next forecast interval returned by the configured API.

The `/weather`, `/location`, and `/compare` utility endpoints are JWT-protected. `/weather` and `/location` use OpenWeather with `OPENWEATHER_KEY` (or legacy `WEATHER_API_KEY`). `/compare` formats 2-10 caller-provided items and scalar attributes; it does not fetch or invent product data. Conversation owners may rate replies as helpful/not helpful; admins review ratings at `/api/admin/feedback`. Review and curate examples manually before retraining.

The chat UI supports up to four PNG/JPEG/WebP images or plain-text/Markdown/CSV/JSON files per message (1 MB each). Attachments are passed to ClamAV using its INSTREAM protocol before processing. Production uploads fail closed unless `CLAMAV_HOST` points to a reachable scanner. Deploy and operate a scanner reachable over Render's private network; the Blueprint does not provision a malware-scanning service.

## User access

Access tokens expire after 15 minutes. A random refresh token is stored only as a SHA-256 hash in PostgreSQL and rotated on refresh; the browser receives it in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie with a seven-day lifetime. Registration never accepts a role from the client. Only addresses configured in `ADMIN_EMAILS` receive the admin role. Admin APIs and chat routes require role-checked bearer tokens. Passwords use bcrypt. Conversation text and replies are stored with AES-256-GCM encryption; intent, model version, timestamp, user ID, and industry are separately indexed metadata. Admin API activity is recorded in the audit table.

```text
JWT_SECRET=replace-with-at-least-32-random-bytes
DATA_ENCRYPTION_KEY=base64-encoded-32-byte-key
```

Never rotate `DATA_ENCRYPTION_KEY` without a migration plan: existing conversation records require the original key to decrypt. Use managed secret storage and encrypted backups. Administrative audit data contains account identifiers and request metadata, so retain and access it accordingly.

## Project layout

- `src/routes`: industry API endpoints
- `src/services`: external integrations and business logic
- `src/models`: persistence boundaries
- `client/src`: React workspace and Tailwind styling
- `src/db.js`: PostgreSQL schema initialization
- `tests`: Node built-in test runner tests
- `docs`: architecture, API reference, and roadmap

## Production notes

Before production traffic, deploy a reachable ClamAV scanner, configure an AI provider, set an admin email, and confirm database backup/retention policies. Rate limiting currently uses per-process memory; use a shared rate-limit store if the service is scaled to multiple instances.
