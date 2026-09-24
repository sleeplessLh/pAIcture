# pAIcture

pAIcture is a web application designed to transform shared AI conversations into clean, portable PDF documents.

## Status

pAIcture is in active early development. The current milestone focuses exclusively on reliable ChatGPT import, preview, PDF export, and paginated PNG export.

Platform share-page formats and access controls can change without notice. pAIcture reports inaccessible or incomplete imports before export rather than silently dropping content.

## Verified extraction feasibility

Real signed-in ChatGPT conversations were tested on September 21, 2026:

| Platform | Browser access | Server extraction | Current result |
| --- | --- | --- | --- |
| ChatGPT public shares | Public `/share/…` page | Server-side structured extraction | Structured preview plus PDF and paginated PNG export |

pAIcture accepts only normal public ChatGPT shared links. It does not request ChatGPT login details, cookies, private conversation URLs, browser extensions, or manual transcripts. Claude and Gemini work is intentionally paused until this workflow is reliable.

## Import architecture

The website separates retrieval, parsing, rendering, and export:

`Public share URL → dedicated retriever → hydration parser → normalized conversation → preview → PDF/PNG`

ChatGPT currently embeds the shared conversation in its React Router hydration stream. pAIcture decodes that structured payload instead of scraping presentation classes. The small Node retriever in `server/extractor.mjs` exists because ChatGPT rejects requests from some serverless edge networks even when the same public page is available from a normal server. It validates the hostname and `/share/` path before fetching, accepts no arbitrary destination, keeps no database, and returns the page only to the pAIcture application.

The hosted site expects `CHATGPT_EXTRACTOR_URL` and `CHATGPT_EXTRACTOR_TOKEN`. `render.yaml` defines a minimal deployment for the retriever; the token must be configured as a secret in both services.

## Supported platform

- ChatGPT public shared links (`https://chatgpt.com/share/...`)

## Planned workflow

`Conversation Link → Parse Conversation → Normalize Content → Render Document → Export PDF`

## Repository structure

```text
pAIcture/
├── app/                    # Interface and server routes
├── lib/conversation/       # Platform adapters and safe content handling
├── server/                 # Restricted public-share retrieval service
├── public/                 # Public brand assets
└── components/             # Reusable interface primitives
```

The application uses a platform-adapter design so future AI providers can be added without changing the main import and export flow.

## Contributing

The project is not yet ready for feature contributions. Contribution guidance will be added as development begins.

## License

Licensed under the [MIT License](LICENSE).
