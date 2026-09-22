# Architecture

The service is an Express API with four industry-specific route modules. Each route validates input and delegates integrations to services. Models currently use in-memory storage so the boundaries can be tested without infrastructure.

```text
Client -> Express app -> Industry route -> Service/model boundary
                                      -> WhatsApp / payments / analytics
```

The application entry point is `src/index.js`; `src/app.js` exports the app for tests and hosting adapters.
