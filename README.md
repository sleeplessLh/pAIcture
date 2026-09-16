# pAIcture

pAIcture is a web application designed to transform shared AI conversations into clean, portable PDF documents.

## Status

pAIcture is in active early development. The first product version includes the responsive import workspace, platform-aware extraction adapters, conversation preview, light and dark themes, print-ready PDF output, and high-resolution PNG export.

Platform share-page formats and access controls can change without notice. pAIcture reports inaccessible or incomplete imports before export rather than silently dropping content.

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
├── components/             # Reusable interface primitives
├── docs/                   # Project documentation
└── tests/                  # Automated tests
```

The application uses a platform-adapter design so future AI providers can be added without changing the main import and export flow.

## Contributing

The project is not yet ready for feature contributions. Contribution guidance will be added as development begins.

## License

Licensed under the [MIT License](LICENSE).
