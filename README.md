# pAIcture

pAIcture is a web application designed to transform shared AI conversations into clean, portable PDF documents.

## Status

pAIcture is in active early development. The current milestone focuses exclusively on reliable ChatGPT import, preview, PDF export, and paginated PNG export.

Platform share-page formats and access controls can change without notice. pAIcture reports inaccessible or incomplete imports before export rather than silently dropping content.

## Verified extraction feasibility

Real signed-in ChatGPT conversations were tested on September 21, 2026:

| Platform | Browser access | Server extraction | Current result |
| --- | --- | --- | --- |
| ChatGPT public shares | Public `/share/…` page | Browser-assisted extraction in the user's session | Structured preview plus PDF and paginated PNG export |
| ChatGPT private conversations | Signed-in `/c/…` or `/g/…/c/…` page | Browser-assisted extraction of the explicitly submitted URL | Complete ordered message validation before preview |

All normal ChatGPT imports now use pAIcture Companion. The website does not fetch ChatGPT pages from its backend. The extension can either open a submitted URL or export the conversation already open in the browser, validates that every rendered turn was extracted, sanitizes the message HTML, and transfers the normalized conversation through one-time local extension storage. Session cookies and credentials are never sent to pAIcture. Claude and Gemini work is intentionally paused until the ChatGPT workflow is reliable.

## Planned platforms

- ChatGPT
- Claude
- Google Gemini
- More AI platforms in the future

## Planned workflow

`Conversation Link → Parse Conversation → Normalize Content → Render Document → Export PDF`

## Repository structure

```text
pAIcture/
├── app/                    # Interface and server routes
├── extension/              # Authenticated browser-side ChatGPT extraction
├── lib/conversation/       # Platform adapters and safe content handling
├── public/                 # Public brand assets
└── components/             # Reusable interface primitives
```

The application uses a platform-adapter design so future AI providers can be added without changing the main import and export flow.

## Contributing

The project is not yet ready for feature contributions. Contribution guidance will be added as development begins.

## License

Licensed under the [MIT License](LICENSE).
