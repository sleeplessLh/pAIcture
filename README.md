# pAIcture

pAIcture turns a public ChatGPT shared conversation into a selectable, paginated document and exports it as a vector PDF or high-resolution PNG pages.

## Supported production workflow

`ChatGPT share URL → structured extraction → Q&A selection → WYSIWYG pages → PDF / PNG`

Public ChatGPT `/share/...` links are supported. pAIcture does not request ChatGPT credentials, cookies, private conversation URLs, browser extensions, or manual transcripts.

## Architecture

- **Application:** React 19 + Vinext/Next-compatible routes, deployed with OpenAI Sites on Cloudflare.
- **Retriever and PDF renderer:** Node.js 22 + Playwright Chromium, deployed as a private-token-protected Render web service.
- **Import:** the application validates the ChatGPT URL, the retriever downloads the public page, and the application decodes ChatGPT's structured hydration payload.
- **Images:** public generated-image assets are resolved during import and returned as stable data URLs for preview/export.
- **Privacy:** pasted links and imported conversations stay in the current browser tab only. Links are cleared after a successful import, API responses are marked `private, no-store`, and the service has no conversation-history database.
- **Concurrency:** the Chromium worker uses a bounded queue (`MAX_CONCURRENT_JOBS`, `MAX_QUEUED_JOBS`) so simultaneous visitors wait safely instead of exhausting the instance with unlimited browser processes.
- **PDF:** semantic HTML is rendered by Chromium to a tagged, selectable-text PDF.
- **PNG:** the same canonical document renderer is rasterized at high DPI in the browser and downloaded as page PNGs/ZIP.
- **Storage:** no database or persistent user-content storage is required. Conversation data is processed per request and in the browser.

The split deployment is intentional: edge/serverless routes provide the UI and API boundary, while Chromium runs in a conventional Node service that supports the browser binary and longer rendering work.

## Requirements

- Node.js `>=22.13.0`
- pnpm matching the lockfile
- Chromium installed through Playwright for the extractor

## Local development

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm exec playwright install chromium
pnpm extractor:start
pnpm dev
```

Use one long random value for `CHATGPT_EXTRACTOR_TOKEN` in both the application and extractor environments. The values in `.env.example` are local-only examples.

## Environment variables

| Variable | Service | Purpose |
| --- | --- | --- |
| `CHATGPT_EXTRACTOR_URL` | Application | HTTPS base URL of the Render extractor. |
| `CHATGPT_EXTRACTOR_TOKEN` | Both | Shared bearer secret. Required by the production extractor. Never expose it to client code. |
| `ALLOWED_ORIGINS` | Extractor | Comma-separated browser origins allowed to call the service. Server-to-server calls are authenticated by token. |
| `MAX_CONCURRENT_JOBS` | Extractor | Maximum active Chromium-backed jobs. Defaults to `1`, which is appropriate for the current low-memory Render instance. |
| `MAX_QUEUED_JOBS` | Extractor | Maximum waiting jobs before returning a retryable busy response. Defaults to `12`. |
| `NODE_ENV` | Extractor | Must be `production` in production; makes a missing token a startup error. |
| `PLAYWRIGHT_BROWSERS_PATH` | Extractor | Browser installation path configuration used by Render. |
| `PORT` | Extractor | Listening port supplied by the hosting provider. |

Do not commit `.env`, `.env.local`, tokens, account credentials, or session data.

## Build and verification

```bash
pnpm lint
pnpm test
pnpm build
```

The production application is served from the generated Sites/Cloudflare build. `pnpm start` runs the generated Worker locally for production-like verification; it is not the public deployment command.

## Production deployment

### 1. Extractor on Render

`render.yaml` defines the Node service, Chromium installation, health check, and non-secret environment values.

1. Create/sync the Render Blueprint from this repository.
2. Set `CHATGPT_EXTRACTOR_TOKEN` as a Render secret.
3. Keep `ALLOWED_ORIGINS` restricted to the production pAIcture origin(s).
4. Confirm `GET /health` returns `{ "ok": true }`.

### 2. Application on Sites

Set the Sites project environment variables:

- `CHATGPT_EXTRACTOR_URL=https://<render-service-host>`
- `CHATGPT_EXTRACTOR_TOKEN=<the same secret>`

Publish the repository through the configured Sites project in `.openai/hosting.json`. After deployment, verify a real public ChatGPT share import and both PDF and PNG downloads; a homepage-only smoke test is insufficient.

## Redeployment checklist

1. Run lint, tests, and the production build.
2. Deploy the Render service and confirm `/health` plus one real import.
3. Publish the Sites application with matching environment variables.
4. Test Q&A selection, generated images, all page settings, PDF, PNG, and responsive layouts on the live URL.
5. Tag the exact verified commit.

## Rollback

Known checkpoints are Git tags. To inspect or restore one safely:

```bash
git show stable-pre-production
git switch --detach stable-pre-production
```

For a hosted rollback, redeploy the tagged commit to Render and Sites with the existing production secrets. Do not overwrite a working branch with `git reset --hard`; create a rollback branch from the tag instead:

```bash
git switch -c codex/rollback-stable-pre-production stable-pre-production
```

## Security boundaries

- Only HTTPS `chatgpt.com/share/...` targets are accepted, including every followed redirect.
- Generated-image downloads are limited to trusted ChatGPT/OpenAI asset hosts.
- Chromium PDF rendering blocks outbound network requests; imported images are embedded before rendering.
- Imported HTML is allow-list sanitized and script/event-handler markup is removed.
- The production extractor fails to start without its bearer token.
- User-facing errors omit stack traces and upstream implementation details.

## License

Licensed under the [MIT License](LICENSE).
