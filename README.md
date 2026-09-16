# pAIcture

pAIcture is a web application designed to transform shared AI conversations into clean, portable PDF documents.

## Status

pAIcture is in active early development. The current build includes the responsive import workspace, platform-aware extraction adapters, conversation preview, light and dark themes, high-resolution PDF output, and paginated PNG export.

Platform share-page formats and access controls can change without notice. pAIcture reports inaccessible or incomplete imports before export rather than silently dropping content.

## Verified extraction feasibility

Real public share links were tested on September 16, 2026:

| Platform | Browser access | Server extraction | Current result |
| --- | --- | --- | --- |
| ChatGPT | Public page opens | Blocked with HTTP 403 in the deployed server runtime | Clear error; no PDF is offered |
| Gemini | Public conversation renders in a browser | The initial HTML does not include the messages; browser-side data loading is required | Clear limitation and future fallback guidance |
| Claude | Public conversation renders in a browser | The initial HTML does not include the messages; browser-side data loading is required | Clear limitation and future fallback guidance |

The ChatGPT adapter includes a decoder for the public page's embedded conversation format, plus Markdown rendering and syntax highlighting, so it can be used when the upstream page is accessible. Gemini and Claude intentionally stop instead of returning an incomplete conversation. Planned fallbacks include a browser extension, authenticated connection, official APIs where available, and user-provided exports.

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
│   └── api/extract/        # Conversation import endpoint
├── lib/conversation/       # Platform adapters and safe content handling
├── public/                 # Public brand assets
└── components/             # Reusable interface primitives
```

The application uses a platform-adapter design so future AI providers can be added without changing the main import and export flow.

## Contributing

The project is not yet ready for feature contributions. Contribution guidance will be added as development begins.

## License

Licensed under the [MIT License](LICENSE).
