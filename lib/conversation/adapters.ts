import hljs from "highlight.js";
import { marked, type Tokens } from "marked";
import { sanitizeHtml } from "./sanitize";
import type { ConversationAdapter, ExtractedConversation, ExtractedMessage, Platform } from "./types";

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};
function titleFromHtml(html: string, platform: Platform) {
  const match = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/<[^>]+>/g, "").replace(/\s*[|—-]\s*(ChatGPT|Gemini|Claude).*$/i, "").trim() || `${platform} conversation`;
}
function renderMarkdown(source: string) {
  const renderer = new marked.Renderer();
  renderer.code = ({ text, lang }: Tokens.Code) => {
    const valid = lang && hljs.getLanguage(lang) ? lang : undefined;
    const highlighted = valid ? hljs.highlight(text, { language: valid }).value : hljs.highlightAuto(text).value;
    return `<pre><code class="hljs${valid ? ` language-${valid}` : ""}">${highlighted}</code></pre>`;
  };
  return sanitizeHtml(marked.parse(source, { async: false, gfm: true, breaks: true, renderer }) as string);
}
function decodeDevalue(flat: unknown[]) {
  const cache = new Map<number, unknown>();
  const resolve = (reference: unknown): unknown => {
    if (typeof reference !== "number") return reference;
    if (reference < 0) return undefined;
    if (cache.has(reference)) return cache.get(reference);
    const raw = flat[reference];
    if (!raw || typeof raw !== "object") return raw;
    const output: unknown = Array.isArray(raw) ? [] : {};
    cache.set(reference, output);
    if (Array.isArray(raw)) raw.forEach((item) => (output as unknown[]).push(resolve(item)));
    else for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const decodedKey = /^_\d+$/.test(key) ? String(resolve(Number(key.slice(1)))) : key;
      (output as Record<string, unknown>)[decodedKey] = resolve(value);
    }
    return output;
  };
  return resolve(0);
}
function findConversation(value: unknown, seen = new Set<unknown>()): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const record = value as Record<string, unknown>;
  const mapping = record.mapping && typeof record.mapping === "object" ? record.mapping as Record<string, unknown> : null;
  const hasMessageNodes = mapping && Object.values(mapping).some((node) => node && typeof node === "object" && "message" in node);
  if (mapping && (record.current_node || record.title || hasMessageNodes)) return record;
  for (const child of Object.values(record)) { const found = findConversation(child, seen); if (found) return found; }
  return null;
}
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const record = content as Record<string, unknown>;
  if (Array.isArray(record.parts)) return record.parts.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    const item = part as Record<string, unknown>;
    if (typeof item.text === "string") return item.text;
    const imageUrl = typeof item.image_url === "string" ? item.image_url : typeof item.url === "string" ? item.url : "";
    if (imageUrl && /^https:\/\//i.test(imageUrl)) return `![Shared conversation image](${imageUrl})`;
    if (typeof item.asset_pointer === "string") return `> Image or attachment reference: ${item.asset_pointer}`;
    return "";
  }).filter(Boolean).join("\n\n");
  return typeof record.text === "string" ? record.text : "";
}
function messagesFromConversation(conversation: Record<string, unknown>): ExtractedMessage[] {
  const mapping = conversation.mapping as Record<string, Record<string, unknown>>;
  const ordered: Record<string, unknown>[] = [];
  let nodeId = typeof conversation.current_node === "string" ? conversation.current_node : null;
  const visited = new Set<string>();
  while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
    visited.add(nodeId); ordered.unshift(mapping[nodeId]);
    nodeId = typeof mapping[nodeId].parent === "string" ? mapping[nodeId].parent as string : null;
  }
  if (!ordered.length) ordered.push(...Object.values(mapping));
  return ordered.flatMap((node, index) => {
    const message = node.message as Record<string, unknown> | undefined;
    const author = message?.author as Record<string, unknown> | undefined;
    const role = author?.role === "user" ? "user" : author?.role === "assistant" ? "assistant" : null;
    const text = contentText(message?.content);
    return role && text.trim() ? [{ id: `message-${index + 1}`, role, html: renderMarkdown(text) } satisfies ExtractedMessage] : [];
  });
}
function balancedElementInner(html: string, start: number, tagName: string) {
  const openingEnd = html.indexOf(">", start);
  if (openingEnd < 0) return "";
  const token = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  token.lastIndex = start;
  let depth = 0;
  for (let match = token.exec(html); match; match = token.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(openingEnd + 1, match.index);
  }
  return "";
}
function messagesFromRenderedChatGptHtml(html: string): ExtractedMessage[] {
  const author = /<div\b[^>]*data-message-author-role=["'](user|assistant)["'][^>]*>/gi;
  return [...html.matchAll(author)].flatMap((match, index) => {
    if (match.index === undefined) return [];
    const role = match[1] as "user" | "assistant";
    const authorHtml = balancedElementInner(html, match.index, "div");
    const contentMarker = role === "assistant"
      ? /<div\b[^>]*class=["'][^"']*\bmarkdown\b[^"']*["'][^>]*>/i
      : /<div\b[^>]*class=["'][^"']*\bwhitespace-pre-wrap\b[^"']*["'][^>]*>/i;
    const contentMatch = contentMarker.exec(authorHtml);
    const content = contentMatch?.index === undefined
      ? authorHtml.replace(/<button\b[\s\S]*?<\/button>/gi, "")
      : balancedElementInner(authorHtml, contentMatch.index, "div");
    let safe = sanitizeHtml(content).trim();
    if (safe && !/^<(?:p|h[1-4]|ul|ol|blockquote|pre|table|figure)\b/i.test(safe)) safe = `<p>${safe}</p>`;
    return safe ? [{ id: `message-${index + 1}`, role, html: safe } satisfies ExtractedMessage] : [];
  });
}
async function fetchChatGptShare(url: URL): Promise<string> {
  const response = await fetch(url, { redirect: "follow", headers });
  if (response.ok) return response.text();
  if (response.status === 404) throw new Error("This shared conversation is unavailable or expired.");
  throw new Error("SOURCE_UNAVAILABLE");
}
const chatgpt: ConversationAdapter = {
  platform: "chatgpt",
  matches: (url) => url.hostname.replace(/^www\./, "") === "chatgpt.com" && /^\/share\/[a-z0-9-]+\/?$/i.test(url.pathname),
  async extract(url): Promise<ExtractedConversation> {
    const html = await fetchChatGptShare(url);
    return parseChatGptShareHtml(html, url.toString());
  },
};

export function parseChatGptShareHtml(html: string, sourceUrl?: string): ExtractedConversation {
  const enqueue = /window\.__reactRouterContext\.streamController\.enqueue\(((?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*'))\)/g;
  let conversation: Record<string, unknown> | null = null;
  const streamedPayloads: string[] = [];
  for (const match of html.matchAll(enqueue)) {
    try {
      const text = match[1].startsWith('"') ? JSON.parse(match[1]) as string : match[1].slice(1, -1).replace(/\\'/g, "'");
      streamedPayloads.push(text);
      const payload = JSON.parse(text);
      conversation = findConversation(Array.isArray(payload) ? decodeDevalue(payload) : payload);
      if (conversation) break;
    } catch {}
  }
  if (!conversation && streamedPayloads.length > 1) {
    try {
      const payload = JSON.parse(streamedPayloads.join(""));
      conversation = findConversation(Array.isArray(payload) ? decodeDevalue(payload) : payload);
    } catch {}
  }
  if (!conversation) {
    const applicationJson = /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
    for (const match of html.matchAll(applicationJson)) {
      try {
        const payload = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
        conversation = findConversation(payload);
        if (conversation) break;
      } catch {}
    }
  }
  const messages = conversation ? messagesFromConversation(conversation) : messagesFromRenderedChatGptHtml(html);
  if (!messages.length) throw new Error("ChatGPT returned the conversation metadata, but no user or assistant messages could be decoded.");
  const warnings = ["Interactive canvases and files that require a signed-in ChatGPT session cannot be embedded automatically."];
  return { title: conversation && typeof conversation.title === "string" ? conversation.title : titleFromHtml(html, "chatgpt"), platform: "chatgpt", sourceUrl, messages, warnings };
}
export const adapters: ConversationAdapter[] = [chatgpt];
