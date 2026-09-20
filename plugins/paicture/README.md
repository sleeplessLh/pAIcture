# pAIcture Plugin

The pAIcture Agent Plugin lets ChatGPT send the current conversation to a structured export widget. The widget previews every supplied user and assistant turn, opens the browser print dialog for PDF output, and downloads paginated PNG images.

## Development connection

1. Deploy the main pAIcture site.
2. Enable Developer Mode in ChatGPT.
3. Register `https://paicture-plugin.lawrancehii12345.chatgpt.site/mcp` as a Streamable HTTP MCP server.
4. Ask ChatGPT: `Export this conversation with pAIcture.`

The server does not persist conversation contents. It accepts only the messages supplied to the tool call and sanitizes rendered Markdown before returning it to the widget.
