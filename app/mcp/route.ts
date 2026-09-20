import { marked } from "marked";
import { sanitizeHtml } from "@/lib/conversation/sanitize";
import { PAICTURE_WIDGET_HTML, PAICTURE_WIDGET_URI } from "@/lib/plugin/widget";

type RpcId = string | number | null;
type RpcRequest = { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> };
type PluginMessage = { role: "user" | "assistant"; content: string };

const tool = {
  name: "render_conversation_export",
  title: "Render conversation export",
  description: "Render a complete AI conversation supplied from the current ChatGPT context as a pAIcture preview. Include every user and assistant turn in original order. The widget lets the user save an A4 PDF or download paginated PNG images.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Conversation title." },
      messages: {
        type: "array", minItems: 1, maxItems: 120,
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string", description: "Complete message content in Markdown." },
          },
          required: ["role", "content"], additionalProperties: false,
        },
      },
    },
    required: ["messages"], additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      messages: { type: "array", items: { type: "object", properties: { role: { type: "string" }, html: { type: "string" } }, required: ["role", "html"] } },
    },
    required: ["title", "messages"],
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: {
    ui: { resourceUri: PAICTURE_WIDGET_URI },
    "openai/outputTemplate": PAICTURE_WIDGET_URI,
    "openai/toolInvocation/invoking": "Preparing conversation…",
    "openai/toolInvocation/invoked": "Conversation ready",
  },
};

function result(id: RpcId, value: unknown) { return { jsonrpc: "2.0", id, result: value }; }
function failure(id: RpcId, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

function renderMessages(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Tool arguments are required.");
  const record = input as { title?: unknown; messages?: unknown };
  if (!Array.isArray(record.messages) || !record.messages.length || record.messages.length > 120) throw new Error("Provide between 1 and 120 conversation messages.");
  const messages = record.messages.map((message, index) => {
    if (!message || typeof message !== "object") throw new Error(`Message ${index + 1} is invalid.`);
    const item = message as Partial<PluginMessage>;
    if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string" || !item.content.trim()) throw new Error(`Message ${index + 1} must include a role and content.`);
    if (item.content.length > 120_000) throw new Error(`Message ${index + 1} is too large for one tool call.`);
    return { role: item.role, html: sanitizeHtml(marked.parse(item.content, { async: false, gfm: true, breaks: true }) as string) };
  });
  return { title: typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 240) : "ChatGPT conversation", messages };
}

async function handle(request: RpcRequest) {
  const id = request.id ?? null;
  switch (request.method) {
    case "initialize":
      return result(id, { protocolVersion: typeof request.params?.protocolVersion === "string" ? request.params.protocolVersion : "2025-06-18", capabilities: { tools: { listChanged: false }, resources: { listChanged: false } }, serverInfo: { name: "paicture", version: "0.1.0" }, instructions: "Use render_conversation_export when the user asks to export the current conversation. Include every visible user and assistant message in original order without summarizing or silently truncating." });
    case "ping": return result(id, {});
    case "tools/list": return result(id, { tools: [tool] });
    case "resources/list": return result(id, { resources: [{ uri: PAICTURE_WIDGET_URI, name: "pAIcture export studio", description: "Preview and export an AI conversation.", mimeType: "text/html;profile=mcp-app" }] });
    case "resources/templates/list": return result(id, { resourceTemplates: [] });
    case "resources/read": {
      if (request.params?.uri !== PAICTURE_WIDGET_URI) return failure(id, -32002, "Resource not found.");
      return result(id, { contents: [{ uri: PAICTURE_WIDGET_URI, mimeType: "text/html;profile=mcp-app", text: PAICTURE_WIDGET_HTML, _meta: { ui: { prefersBorder: true, domain: "https://paicture-plugin.lawrancehii12345.chatgpt.site", csp: { connectDomains: [], resourceDomains: ["https://cdn.jsdelivr.net"] } } } }] });
    }
    case "tools/call": {
      if (request.params?.name !== tool.name) return failure(id, -32602, "Unknown tool.");
      try {
        const prepared = renderMessages(request.params?.arguments);
        return result(id, { structuredContent: prepared, content: [{ type: "text", text: `Prepared ${prepared.messages.length} messages for pAIcture export.` }] });
      } catch (error) {
        return result(id, { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "The conversation could not be prepared." }] });
      }
    }
    default: return failure(id, -32601, `Method not found: ${request.method || "unknown"}`);
  }
}

export async function POST(request: Request) {
  let payload: RpcRequest | RpcRequest[];
  try { payload = await request.json() as RpcRequest | RpcRequest[]; }
  catch { return Response.json(failure(null, -32700, "Parse error."), { status: 400 }); }
  if (Array.isArray(payload)) return Response.json(await Promise.all(payload.map(handle)));
  if (payload.id === undefined) { await handle(payload); return new Response(null, { status: 202 }); }
  return Response.json(await handle(payload), { headers: { "Cache-Control": "no-store" } });
}

export function GET() { return Response.json({ name: "pAIcture MCP", version: "0.1.0", endpoint: "/mcp" }); }
export function OPTIONS() { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, mcp-protocol-version", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } }); }
