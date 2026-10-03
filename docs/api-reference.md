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

`POST /chat` accepts the same JSON body plus an optional `industry` and returns the reply as `text/plain`.

## Tools

All tool routes require `Authorization: Bearer <access-token>`.

`POST /weather` fetches current conditions or a forecast using OpenWeather.

```json
{ "location": "Paris", "forecast": false }
```

`forecast` is optional and defaults to `false`. The response is `{ "reply": "..." }` with concise icon-led plain text.

`POST /location` geocodes a place name with OpenWeather.

```json
{ "query": "Paris, France" }
```

Returns up to five matches containing name, state, country, latitude, and longitude.

`POST /compare` structures caller-supplied values; it does not query product catalogs or invent missing facts.

```json
{
  "items": [
    { "name": "Basic", "price": 10, "warranty": "1 year" },
    { "name": "Plus", "price": 15, "warranty": "2 years" }
  ]
}
```

Returns a `columns` array and `rows` array. Provide 2-10 objects, each with a `name` and up to 12 scalar attributes.

## Feedback

`POST /api/conversations/{conversationId}/feedback` requires the conversation owner token.

```json
{ "rating": "helpful" }
```

`rating` is `helpful` or `not_helpful`. The owner may update their rating. `GET /api/admin/feedback` is admin-only and returns ratings with user, conversation, and timestamp metadata for human review. Feedback is not automatically used as training data.

## Admin

`GET /api/admin/failed-queries` (requires an admin token) returns up to 100 inference failures with user ID, industry, model version, timestamp, and error category. Failed message text is not included.
