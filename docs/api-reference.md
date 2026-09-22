# API Reference

## Authentication

Register or sign in before using an industry chat route. Send the returned token as `Authorization: Bearer <token>`.

`POST /api/auth/register` and `POST /api/auth/login` accept `{ "email": "user@example.com", "password": "at-least-8-characters" }`.

`GET /api/auth/me` returns the authenticated user.

## Health

`GET /chat-status`

Returns `{ "status": "ok", "service": "ai-chatbot-startup" }`.

## Chat

`POST /api/{industry}/chat` (requires authentication)

Supported industries: `school`, `clinic`, `retail`, `restaurant`.

Request:

```json
{ "message": "User question" }
```

Success response:

```json
{ "industry": "school", "reply": "..." }
```

Invalid or missing messages return HTTP 400.
