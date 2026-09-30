# AI Chatbot Startup

A minimal Express API starter for industry-specific chatbot experiences across schools, clinics, retail, and restaurants.

## Quick start

```bash
npm install
npm test
npm start
```

The API listens on `http://localhost:3000` by default.

## Endpoints

- `GET /chat-status`
- `POST /api/school/chat`
- `POST /api/clinic/chat`
- `POST /api/retail/chat`
- `POST /api/restaurant/chat`

Chat endpoints accept JSON such as `{ "message": "What are your opening hours?" }`.

## Configuration

Copy `config/env.example` to `.env` and set values as needed. Configure `AI_API_KEY` to enable real answers for every service desk. `AI_API_URL` must point to an OpenAI-compatible chat-completions endpoint and `AI_MODEL` selects the provider model ID (for example, a Gemini model ID). `AI_ASSISTANT_NAME` controls the shared assistant identity and defaults to `moonlit`; it is not a separately trained model and must not replace the provider model ID. Without provider credentials, the app returns an explicit configuration fallback. WhatsApp credentials are optional and only needed when a WhatsApp integration is connected; the current WhatsApp sender helper is not yet exposed through a send route or webhook. User accounts are in-memory and browser chat history is stored locally; use durable, access-controlled storage before production.

## Deploy to Render

This repository includes `render.yaml` for a free Render web service.

1. Push the repository to GitHub.
2. In Render, choose **New +** and **Blueprint**.
3. Connect `ahirenivedita25-prog/ai-chatbot-app`.
4. Select the branch to deploy and apply the Blueprint.
5. Open the generated `https://...onrender.com/` URL.

Render uses `npm install`, `npm start`, and `/chat-status` automatically. The Blueprint generates `JWT_SECRET`; do not commit a local `.env` file or paste secrets into source control. The free service may sleep after inactivity.

After the Render service is created, add `AI_API_KEY`, `AI_API_URL`, `AI_MODEL`, and optionally `AI_ASSISTANT_NAME=moonlit` under **Environment**. Keep `AI_API_KEY` secret. For Gemini's OpenAI-compatible endpoint, use `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` and the exact Gemini model ID enabled for your key. The Render service requires the API key even though the assistant is named Moonlit. Add `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` only when enabling the separate WhatsApp integration.

The chat UI supports up to four PNG/JPEG/WebP images or plain-text/Markdown/CSV/JSON files per message (1 MB each). Images are sent to the configured model for analysis; text-file contents are included as context. Chat history and attachment names are local to the browser, not shared across devices.

## User access

Chat routes require a bearer token. The browser at `/` provides registration and sign-in. Set a long random `JWT_SECRET` in `.env` before starting the app:

```text
JWT_SECRET=replace-with-a-long-random-secret
```

Authentication endpoints are `POST /api/auth/register`, `POST /api/auth/login`, and `GET /api/auth/me`. Passwords are hashed with bcrypt, and tokens expire after two hours. Because users are currently stored in memory, accounts disappear when the server restarts; use a durable database before production.

## Project layout

- `src/routes`: industry API endpoints
- `src/services`: external integrations and business logic
- `src/models`: persistence boundaries
- `tests`: Node built-in test runner tests
- `docs`: architecture, API reference, and roadmap

## Production notes

Add authentication, authorization, durable persistence, rate limiting, request correlation, provider-specific chatbot logic, and consent/privacy controls before exposing the service publicly.
