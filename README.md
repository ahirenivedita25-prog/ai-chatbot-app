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

Chat endpoints accept JSON such as `{ "message": "What are your opening hours?" }` and require a valid short-lived access token. Replies are plain-text strings in the API envelope. Each successful response includes a model version and conversation ID.

- `POST /api/auth/register`, `POST /api/auth/login`
- `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/conversations` (owner-scoped)
- `GET /api/admin/settings`, `GET /api/admin/help`, `GET /api/admin/audit`, `GET /api/admin/conversations` (admin only)

## Configuration

Copy `config/env.example` to `.env` for local development. Set `DATABASE_URL` to enable PostgreSQL persistence. Production startup requires `DATABASE_URL`, a `JWT_SECRET` of at least 32 bytes, a base64-encoded 32-byte `DATA_ENCRYPTION_KEY`, and at least one address in `ADMIN_EMAILS`. Configure `AI_API_KEY` for provider-backed answers. `AI_API_URL` must point to an OpenAI-compatible chat-completions endpoint and `AI_MODEL` selects the provider model ID. `MOONLIT_MODEL_VERSION` is restricted to `moonlit-brain-v1` or `moonlit-brain-v2` in responses. `AI_ASSISTANT_NAME` controls the assistant display identity, not the provider model. WhatsApp credentials remain optional and are not exposed through a send route or webhook.

## Deploy to Render

This repository includes `render.yaml` for a Render web service and private PostgreSQL database.

1. Push the repository to GitHub.
2. In Render, choose **New +** and **Blueprint**.
3. Connect the repository containing this Blueprint.
4. Select the branch to deploy and apply the Blueprint.
5. Open the generated `https://...onrender.com/` URL.

The Blueprint builds the React client with `npm ci && npm run build`, starts the Express service with `npm start`, and uses `/chat-status` for health checks. It provisions PostgreSQL and generates the JWT and data-encryption secrets. During initial Blueprint setup, provide `ADMIN_EMAILS`, `AI_API_KEY`, and `CLAMAV_HOST`; configure `CLAMAV_PORT` if it differs from 3310. Render's free web service may sleep after inactivity, and the selected database plan must be available to the workspace.

For an existing Render Blueprint, values marked `sync: false` may need to be set manually in the service's Environment panel. Keep all credentials out of source control. The Render web service terminates HTTPS; the app rejects non-HTTPS API requests in production.

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
