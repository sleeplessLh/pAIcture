import { marked } from "marked";
import katex from "katex";
import { sanitizeHtml } from "@/lib/conversation/sanitize";
import { PAICTURE_WIDGET_HTML, PAICTURE_WIDGET_URI } from "@/lib/plugin/widget";

type RpcId = string | number | null;
type RpcRequest = { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> };
type OpenAIFile = { download_url: string; file_id: string; mime_type?: string; file_name?: string };
type PluginPart = { type: "markdown"; content: string } | { type: "file"; file_id: string; alt?: string };
type PluginMessageContent = { content?: string; parts?: PluginPart[] };
type NormalizedMessage = { id: string; role: "user" | "assistant"; html: string; exchangeId: number; sourceLength: number };
type NormalizedExchange = { id: string; complete: boolean; messages: NormalizedMessage[] };

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

function renderMarkdown(source: string) {
  const rendered: string[] = [];
  const token = (tex: string, displayMode: boolean) => {
    const key = `PAICTUREMATH${rendered.length}TOKEN`;
    rendered.push(`<span class="math-expression ${displayMode ? "math-display" : "math-inline"}">${katex.renderToString(tex.trim(), { displayMode, output: "htmlAndMathml", throwOnError: false, strict: "ignore", trust: false })}</span>`);
    return key;
  };
  const looksMathematical = (value: string) => /\\(?:frac|dfrac|tfrac|sqrt|begin|end|left|right|sum|prod|int|lim|alpha|beta|gamma|delta|theta|lambda|mu|pi|rho|sigma|phi|omega|rightarrow|leftarrow|infty|cdot|times|pm|leq|geq|neq|overline|underline|mathbf|mathrm)\b|[_^][{A-Za-z0-9]|[A-Za-z][A-Za-z0-9_]*\s*[=+\-*/]\s*[A-Za-z0-9]/.test(value);
  const normalizeChatGptMath = (value: string) => {
    const lines = value.split(/\r?\n/);
    const normalized: string[] = [];
    let inFence = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\s*```/.test(line)) { inFence = !inFence; normalized.push(line); continue; }
      if (inFence) { normalized.push(line); continue; }
      if (/^\s*\[\s*$/.test(line)) {
        const block: string[] = [];
        let cursor = index + 1;
        while (cursor < lines.length && !/^\s*\]\s*$/.test(lines[cursor])) { block.push(lines[cursor]); cursor += 1; }
        const expression = block.join("\n").trim();
        if (cursor < lines.length && expression && looksMathematical(expression)) {
          normalized.push(token(expression, true));
          index = cursor;
          continue;
        }
      }
      const trimmed = line.trim();
      const hasExplicitDelimiter = /\\\(|\\\[|\$/.test(trimmed);
      const isPureFormulaLine = !/[\u3400-\u9fff]/.test(trimmed) && !/[。！？：；]/.test(trimmed);
      if (trimmed && !hasExplicitDelimiter && isPureFormulaLine && looksMathematical(trimmed) && /\\[A-Za-z]+/.test(trimmed)) normalized.push(token(trimmed, false));
      else normalized.push(line);
    }
    return normalized.join("\n");
  };
  const markdown = normalizeChatGptMath(source)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, tex: string) => token(tex, true))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, tex: string) => token(tex, true))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, tex: string) => token(tex, false))
    .replace(/(^|[^$])\$([^$\n]+)\$(?!\$)/g, (match, prefix: string, tex: string) => looksMathematical(tex) ? `${prefix}${token(tex, false)}` : match);
  return sanitizeHtml(marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string)
    .replace(/PAICTUREMATH(\d+)TOKEN/g, (_, index: string) => rendered[Number(index)] || "");
}

const tool = {
  name: "render_conversation_export",
  title: "Render conversation export",
  description: "Prepare a faithful pAIcture export from conversation context legitimately available to this tool call. Before calling, scan the current ChatGPT context and provide every complete historical user-to-assistant Q&A exchange that appears before the user's pAIcture/export invocation. Do not include the export invocation itself as a question. Put each complete pair in exchanges, in chronological order, with verbatim full Markdown or ordered file parts; never summarize, shorten, merge, invent, or omit an available complete exchange. If ChatGPT exposes only one complete exchange, send only that exchange with scope latest_exchange and state the limitation accurately.",
  inputSchema: {
    type: "object",
    $defs: {
      OpenAIFile: {
        type: "object",
        properties: {
          download_url: { type: "string" }, file_id: { type: "string" },
          mime_type: { type: "string" }, file_name: { type: "string" },
        },
        required: ["download_url", "file_id"], additionalProperties: false,
      },
      MessageContent: {
        type: "object",
        properties: {
          content: { type: "string", description: "Complete verbatim Markdown when this message has no ordered file parts." },
          parts: { type: "array", minItems: 1, items: { oneOf: [
            { type: "object", properties: { type: { const: "markdown" }, content: { type: "string" } }, required: ["type", "content"], additionalProperties: false },
            { type: "object", properties: { type: { const: "file" }, file_id: { type: "string" }, alt: { type: "string" } }, required: ["type", "file_id"], additionalProperties: false },
          ] } },
        },
        anyOf: [{ required: ["content"] }, { required: ["parts"] }],
        additionalProperties: false,
      },
    },
    properties: {
      title: { type: "string", description: "Conversation title." },
      scope: { type: "string", enum: ["latest_exchange", "explicit_selection", "available_context"], description: "Use available_context when all complete exchanges visible in current tool context are supplied; latest_exchange only when exactly one complete prior pair is exposed; explicit_selection only when the user named particular exchanges." },
      exchanges: {
        type: "array", minItems: 1, maxItems: 60,
        description: "Every complete Q&A pair actually available in current ChatGPT context, oldest to newest. Exclude the command that invoked pAIcture.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Stable source-order identifier such as exchange-1." },
            question: { $ref: "#/$defs/MessageContent" },
            answer: { $ref: "#/$defs/MessageContent" },
          },
          required: ["question", "answer"], additionalProperties: false,
        },
      },
      messages: {
        type: "array", minItems: 2, maxItems: 120,
        description: "Backward-compatible complete conversation messages, oldest to newest. Use exchanges when the refreshed schema is available. A final unmatched export instruction is ignored.",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string" },
            parts: { $ref: "#/$defs/MessageContent/properties/parts" },
          },
          required: ["role"], additionalProperties: false,
          anyOf: [{ required: ["content"] }, { required: ["parts"] }],
        },
      },
      files: { type: "array", items: { $ref: "#/$defs/OpenAIFile" } },
    },
    required: ["scope"],
    anyOf: [{ required: ["exchanges"] }, { required: ["messages"] }],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      exchanges: { type: "array", items: { type: "object", properties: { id: { type: "string" }, complete: { type: "boolean" }, messages: { type: "array", items: { type: "object", properties: { id: { type: "string" }, role: { type: "string" }, html: { type: "string" }, exchangeId: { type: "integer" }, sourceLength: { type: "integer" } }, required: ["id", "role", "html", "exchangeId", "sourceLength"] } } }, required: ["id", "complete", "messages"] } },
      exchangeCount: { type: "integer" },
      groupingReliable: { type: "boolean" },
      groupingNotice: { type: "string" },
      sourceScope: { type: "string" }, sourceNotice: { type: "string" }, suppliedFileCount: { type: "integer" },
    },
    required: ["title", "exchanges", "exchangeCount", "groupingReliable", "groupingNotice", "sourceScope", "sourceNotice", "suppliedFileCount"],
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: {
    ui: { resourceUri: PAICTURE_WIDGET_URI },
    "openai/outputTemplate": PAICTURE_WIDGET_URI,
    "openai/toolInvocation/invoking": "Preparing conversation…",
    "openai/toolInvocation/invoked": "Conversation ready",
    "openai/fileParams": ["files"],
  },
};

function result(id: RpcId, value: unknown) { return { jsonrpc: "2.0", id, result: value }; }
function failure(id: RpcId, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

function renderMessages(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Tool arguments are required.");
  const record = input as { title?: unknown; scope?: unknown; exchanges?: unknown; messages?: unknown; files?: unknown };
  if (record.scope !== "latest_exchange" && record.scope !== "explicit_selection" && record.scope !== "available_context") throw new Error("Declare the legitimately available conversation scope.");
  const hasExplicitExchanges = Array.isArray(record.exchanges) && record.exchanges.length > 0;
  const hasLegacyMessages = Array.isArray(record.messages) && record.messages.length > 0;
  if (!hasExplicitExchanges && !hasLegacyMessages) throw new Error("Provide complete prior Q&A exchanges or a complete ordered message sequence. Do not include the export request itself.");
  if (hasExplicitExchanges && (record.exchanges as unknown[]).length > 60) throw new Error("Provide no more than 60 complete prior Q&A exchanges.");
  if (hasLegacyMessages && (record.messages as unknown[]).length > 120) throw new Error("Provide no more than 120 complete prior messages.");
  const files = Array.isArray(record.files) ? record.files as OpenAIFile[] : [];
  const filesById = new Map(files.filter((file) => file && typeof file.file_id === "string" && typeof file.download_url === "string").map((file) => [file.file_id, file]));
  const normalizeMessage = (message: unknown, role: "user" | "assistant", exchangeId: number): NormalizedMessage => {
    if (!message || typeof message !== "object") throw new Error(`Exchange ${exchangeId} has an invalid ${role} message.`);
    const item = message as PluginMessageContent;
    const parts = Array.isArray(item.parts) && item.parts.length ? item.parts : typeof item.content === "string" ? [{ type: "markdown", content: item.content } as PluginPart] : [];
    if (!parts.length) throw new Error(`Exchange ${exchangeId} ${role} message must include complete content or ordered parts.`);
    let sourceLength = 0;
    const html = parts.map((part) => {
      if (part.type === "markdown") {
        if (typeof part.content !== "string" || !part.content.trim()) throw new Error(`Exchange ${exchangeId} ${role} message contains an empty Markdown part.`);
        sourceLength += part.content.length;
        return renderMarkdown(part.content);
      }
      const file = filesById.get(part.file_id);
      if (!file) throw new Error(`Exchange ${exchangeId} ${role} message references a file ChatGPT did not provide to this tool call.`);
      if (file.mime_type && !file.mime_type.startsWith("image/")) return `<p><a href="${escapeAttribute(file.download_url)}">${escapeAttribute(file.file_name || part.alt || "Attached file")}</a></p>`;
      return `<figure><img src="${escapeAttribute(file.download_url)}" alt="${escapeAttribute(part.alt || file.file_name || "Conversation image")}"></figure>`;
    }).join("");
    if (sourceLength > 120_000) throw new Error(`Exchange ${exchangeId} ${role} message is too large for one tool call.`);
    return { id: `exchange-${exchangeId}-${role}`, role, html, exchangeId, sourceLength };
  };
  const explicitCandidates = hasExplicitExchanges ? record.exchanges as unknown[] : [];
  const legacyCandidates: Array<{ id?: string; question: unknown; answer: unknown }> = [];
  if (!hasExplicitExchanges && hasLegacyMessages) {
    let pendingUser: unknown = null;
    for (const candidate of record.messages as unknown[]) {
      if (!candidate || typeof candidate !== "object") continue;
      const message = candidate as { role?: unknown };
      if (message.role === "user") {
        pendingUser = candidate;
        continue;
      }
      if (message.role === "assistant" && pendingUser) {
        legacyCandidates.push({ question: pendingUser, answer: candidate });
        pendingUser = null;
      }
    }
  }
  const candidates: unknown[] = hasExplicitExchanges ? explicitCandidates : legacyCandidates;
  if (!candidates.length) throw new Error("No complete user-to-assistant exchange was supplied. A final unmatched export instruction is not exportable conversation content.");
  const exchanges: NormalizedExchange[] = candidates.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`Exchange ${index + 1} is invalid.`);
    const item = candidate as { id?: unknown; question?: unknown; answer?: unknown };
    const exchangeId = index + 1;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 120) : String(exchangeId);
    return { id, complete: true, messages: [normalizeMessage(item.question, "user", exchangeId), normalizeMessage(item.answer, "assistant", exchangeId)] };
  });
  const groupingReliable = true;
  const groupingNotice = hasExplicitExchanges ? "" : "ChatGPT used the legacy ordered-message contract. pAIcture paired every complete user-to-assistant exchange and ignored any final unmatched export instruction.";
  const sourceNotice = record.scope === "latest_exchange"
    ? "ChatGPT provided only the latest complete Q&A exchange for this invocation. Hidden conversation history was not accessed."
    : record.scope === "explicit_selection"
      ? "This export contains only messages explicitly selected or provided by the user."
      : `ChatGPT supplied ${exchanges.length} complete Q&A exchange${exchanges.length === 1 ? "" : "s"} to this tool. pAIcture cannot access hidden history.`;
  return { title: typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 240) : "ChatGPT conversation", exchanges, exchangeCount: exchanges.length, groupingReliable, groupingNotice, sourceScope: record.scope, sourceNotice, suppliedFileCount: filesById.size };
}

async function handle(request: RpcRequest) {
  const id = request.id ?? null;
  switch (request.method) {
    case "initialize":
      return result(id, { protocolVersion: typeof request.params?.protocolVersion === "string" ? request.params.protocolVersion : "2025-06-18", capabilities: { tools: { listChanged: false }, resources: { listChanged: false } }, serverInfo: { name: "paicture", version: "0.6.0" }, instructions: "Use render_conversation_export only after the user explicitly requests an export. Before calling it, inspect the conversation context currently available to you and build exchanges from every complete historical user question and matching assistant answer that precedes the export request. Exclude the pAIcture/export invocation itself. Copy each question and answer fully and verbatim as Markdown or ordered file parts, oldest to newest; never summarize, shorten, merge, invent, or silently omit an available complete exchange. If the platform exposes only one prior complete exchange, send only that pair with scope latest_exchange and accurately disclose the limitation. Never access or request private chat history, cookies, authentication tokens, passwords, browser data, or account credentials." });
    case "ping": return result(id, {});
    case "tools/list": return result(id, { tools: [tool] });
    case "resources/list": return result(id, { resources: [{ uri: PAICTURE_WIDGET_URI, name: "pAIcture export studio", description: "Preview and export an AI conversation.", mimeType: "text/html;profile=mcp-app" }] });
    case "resources/templates/list": return result(id, { resourceTemplates: [] });
    case "resources/read": {
      if (request.params?.uri !== PAICTURE_WIDGET_URI) return failure(id, -32002, "Resource not found.");
      return result(id, { contents: [{ uri: PAICTURE_WIDGET_URI, mimeType: "text/html;profile=mcp-app", text: PAICTURE_WIDGET_HTML, _meta: { ui: { prefersBorder: true, availableDisplayModes: ["inline", "fullscreen"], csp: { connectDomains: [], resourceDomains: ["https://cdn.jsdelivr.net"] } }, "openai/ui": { availableDisplayModes: ["inline", "fullscreen"] }, "openai/widgetDescription": "Select complete Q&A exchanges, preview exact pages, and download PDF or PNG exports." } }] });
    }
    case "tools/call": {
      if (request.params?.name !== tool.name) return failure(id, -32602, "Unknown tool.");
      try {
        const prepared = renderMessages(request.params?.arguments);
        const messageCount = prepared.exchanges.reduce((total, exchange) => total + exchange.messages.length, 0);
        return result(id, { structuredContent: prepared, content: [{ type: "text", text: `Prepared ${messageCount} messages in ${prepared.exchangeCount} exchanges for pAIcture export.` }] });
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

export function GET() { return Response.json({ name: "pAIcture MCP", version: "0.6.0", endpoint: "/api/mcp" }); }
export function OPTIONS() { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, mcp-protocol-version", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } }); }
