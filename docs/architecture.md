# Architecture

The service is an Express API with JWT-protected chat and utility routes. Chat routes validate and sanitize inputs, scan attachments, delegate to external AI/weather services, then encrypt conversation text at rest. PostgreSQL stores account, conversation, feedback, failure, and audit data; selected model modules retain in-memory fallbacks for isolated tests.

```text
Client -> Express app -> JWT/rate limit -> Chat/tools/conversation/admin routes
                                      -> AI/OpenWeather/geocoding/comparison services
                                      -> PostgreSQL models (encrypted conversation content)
Training data -> normalize/deduplicate -> persisted train/test splits -> HF Trainer
Human-reviewed feedback -> curated Q&A source -> new versioned training run
```

The application entry point is `src/index.js`; `src/app.js` exports the app for tests and hosting adapters. Feedback ratings and failed-query metadata are review signals only; they are not automatically turned into training examples.
