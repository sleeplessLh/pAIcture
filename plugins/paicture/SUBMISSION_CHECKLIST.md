# pAIcture ChatGPT plugin submission checklist

## Automated checks completed locally

- MCP `initialize`, `tools/list`, `resources/read`, and `tools/call` requests succeed.
- The widget resource uses `text/html;profile=mcp-app` and declares its CSP.
- Every tool declares `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
- Privacy policy, terms, and support routes build successfully.
- The package contains square SVG icon and logo assets.
- The portable root manifest no longer references `.app.json`; current uploads containing `apps` references are not accepted.

## Before connecting in ChatGPT Developer Mode

1. Deploy this exact revision to the production plugin host.
2. Confirm `https://paicture-plugin.lawrancehii12345.chatgpt.site/api/mcp` is publicly reachable.
3. In ChatGPT, enable Developer Mode and connect that URL as a Streamable HTTP MCP server.
4. Run each positive and negative case below and record the results.

## Positive review cases

1. **Full conversation export** — “Export this entire conversation with pAIcture.” Expected tool: `render_conversation_export`; expected result: every user and assistant turn appears in original order.
2. **PDF intent** — “Create a PDF preview of this chat.” Expected tool: `render_conversation_export`; expected result: the widget opens with a working browser-print PDF action.
3. **PNG intent** — “Turn this conversation into PNG pages.” Expected tool: `render_conversation_export`; expected result: the widget offers paginated PNG downloads.
4. **Technical content** — Use a conversation containing headings, lists, a table, links, code, and math. Expected result: Markdown structure and code formatting remain readable in the preview.
5. **Unicode content** — Use a multilingual conversation. Expected result: supplied Unicode text remains present and ordered correctly.

## Negative review cases

1. **No conversation supplied** — Call the tool with an empty `messages` array. Expected result: a clear validation error; no empty export.
2. **Unsupported role** — Supply a message with a role other than `user` or `assistant`. Expected result: a clear validation error.
3. **Credential request** — Ask pAIcture to retrieve a password, ChatGPT token, or private account history. Expected result: it does not access credentials or private history and asks the user to provide only exportable conversation content.

## Required human submission steps

- Obtain Apps Management Write access in the owning OpenAI organization.
- Complete individual or business developer-identity verification.
- Copy the portal-provided domain token into `OPENAI_APPS_CHALLENGE_TOKEN`, deploy it, and verify the plain-text challenge URL.
- Record a reviewer-accessible walkthrough video demonstrating the test cases.
- Upload the generated ZIP in the OpenAI Platform Plugins dashboard and resolve automated findings.
- Submit five successful positive cases, three negative cases, release notes, country availability, and policy attestations.
