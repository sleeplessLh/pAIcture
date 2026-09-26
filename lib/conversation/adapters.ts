import hljs from "highlight.js";
import katex from "katex";
import { marked, type Tokens } from "marked";
import { sanitizeHtml } from "./sanitize.ts";
import type { ContentPart, ConversationAdapter, ExtractedConversation, ExtractedMessage, Platform, ResolvedImageAsset, ResolvedImageAssets } from "./types.ts";

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};
function titleFromHtml(html: string, platform: Platform) {
  const match = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/<[^>]+>/g, "").replace(/\s*[|—-]\s*(ChatGPT|Gemini|Claude).*$/i, "").trim() || `${platform} conversation`;
}
function extractMath(source: string) {
  const rendered: string[] = [];
  const token = (tex: string, displayMode: boolean) => {
    const index = rendered.length;
    const key = `PAICTUREMATH${displayMode ? "DISPLAY" : "INLINE"}${index}TOKEN`;
    const math = katex.renderToString(tex.trim(), {
      displayMode,
      output: "mathml",
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
    rendered.push(`<span class="math-expression ${displayMode ? "math-display" : "math-inline"}">${math}</span>`);
    return key;
  };
  const markdown = source
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, tex: string) => token(tex, true))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, tex: string) => token(tex, true))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, tex: string) => token(tex, false));
  return { markdown, rendered };
}

export function renderMarkdown(source: string) {
  const { markdown, rendered } = extractMath(source);
  const renderer = new marked.Renderer();
  renderer.code = ({ text, lang }: Tokens.Code) => {
    const valid = lang && hljs.getLanguage(lang) ? lang : undefined;
    const highlighted = valid ? hljs.highlight(text, { language: valid }).value : hljs.highlightAuto(text).value;
    return `<pre><code class="hljs${valid ? ` language-${valid}` : ""}">${highlighted}</code></pre>`;
  };
  return sanitizeHtml(marked.parse(markdown, { async: false, gfm: true, breaks: true, renderer }) as string)
    .replace(/PAICTUREMATH(?:DISPLAY|INLINE)(\d+)TOKEN/g, (_, index: string) => rendered[Number(index)] || "");
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
function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function imageHtml(asset: ResolvedImageAsset, pointer?: string) {
  const dimensions = [
    asset.width ? ` width="${asset.width}"` : "",
    asset.height ? ` height="${asset.height}"` : "",
  ].join("");
  const pointerAttribute = pointer ? ` data-asset-pointer="${escapeAttribute(pointer)}"` : "";
  return `<figure class="conversation-image"${pointerAttribute}><img src="${escapeAttribute(asset.src)}" alt="${escapeAttribute(asset.alt || "ChatGPT generated image")}"${dimensions} loading="eager" decoding="async"></figure>`;
}
function unavailableImageHtml(pointer?: string) {
  const pointerAttribute = pointer ? ` data-asset-pointer="${escapeAttribute(pointer)}"` : "";
  return `<figure class="conversation-image-unavailable"${pointerAttribute}><strong>Image could not be retrieved.</strong><span>The shared image asset is unavailable or requires access that the public link did not provide.</span></figure>`;
}
function resolveAsset(pointer: string, assets: ResolvedImageAssets) {
  return assets[pointer] || assets[pointer.replace(/\?.*$/, "")];
}
function imageTitleKey(title: string) {
  return `image-title:${title.trim().toLowerCase()}`;
}
function assetPointers(value: unknown, output: string[] = []): string[] {
  if (!value || typeof value !== "object") return output;
  const record = value as Record<string, unknown>;
  if (typeof record.asset_pointer === "string") output.push(record.asset_pointer);
  for (const child of Object.values(record)) assetPointers(child, output);
  return output;
}
function partToContent(part: unknown, assets: ResolvedImageAssets): ContentPart[] {
  if (typeof part === "string") return part.trim() ? [{ type: "text", html: renderMarkdown(part) }] : [];
  if (!part || typeof part !== "object") return [];
  const item = part as Record<string, unknown>;
  if (typeof item.text === "string") return item.text.trim() ? [{ type: "text", html: renderMarkdown(item.text) }] : [];
  const imageUrl = typeof item.image_url === "string" ? item.image_url : typeof item.url === "string" ? item.url : "";
  if (imageUrl && (/^https:\/\//i.test(imageUrl) || /^data:image\//i.test(imageUrl))) {
    const asset = {
      src: imageUrl,
      alt: typeof item.alt === "string" ? item.alt : "ChatGPT generated image",
      width: typeof item.width === "number" ? item.width : undefined,
      height: typeof item.height === "number" ? item.height : undefined,
    };
    return [{ type: "image", ...asset }];
  }
  if (typeof item.asset_pointer === "string") {
    const asset = resolveAsset(item.asset_pointer, assets);
    return asset
      ? [{
        type: "image",
        ...asset,
        width: asset.width ?? (typeof item.width === "number" ? item.width : undefined),
        height: asset.height ?? (typeof item.height === "number" ? item.height : undefined),
        assetPointer: item.asset_pointer,
      }]
      : [{ type: "image_unavailable", assetPointer: item.asset_pointer, reason: "The public shared asset could not be resolved." }];
  }
  return [];
}
export function normalizeContentParts(content: unknown, assets: ResolvedImageAssets = {}): ContentPart[] {
  if (typeof content === "string") return partToContent(content, assets);
  if (!content || typeof content !== "object") return [];
  const record = content as Record<string, unknown>;
  if (Array.isArray(record.parts)) return record.parts.flatMap((part) => partToContent(part, assets));
  if (typeof record.text === "string") return partToContent(record.text, assets);
  return partToContent(record, assets);
}
function isSkippedMainlineContent(content: unknown) {
  if (!content || typeof content !== "object") return false;
  const record = content as Record<string, unknown>;
  if (record.content_type !== "code" || typeof record.text !== "string") return false;
  try {
    const value = JSON.parse(record.text) as Record<string, unknown>;
    return value.skipped_mainline === true;
  } catch {
    return false;
  }
}
function contentPartsHtml(parts: ContentPart[]) {
  return parts.map((part) => {
    if (part.type === "text") return part.html;
    if (part.type === "image") return imageHtml(part, part.assetPointer);
    return unavailableImageHtml(part.assetPointer);
  }).join("\n");
}
function messagesFromConversation(conversation: Record<string, unknown>, assets: ResolvedImageAssets): ExtractedMessage[] {
  const mapping = conversation.mapping as Record<string, Record<string, unknown>>;
  const ordered: Record<string, unknown>[] = [];
  let nodeId = typeof conversation.current_node === "string" ? conversation.current_node : null;
  const visited = new Set<string>();
  while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
    visited.add(nodeId); ordered.unshift(mapping[nodeId]);
    nodeId = typeof mapping[nodeId].parent === "string" ? mapping[nodeId].parent as string : null;
  }
  if (!ordered.length) ordered.push(...Object.values(mapping));
  const messages: ExtractedMessage[] = [];
  for (const [index, node] of ordered.entries()) {
    const message = node.message as Record<string, unknown> | undefined;
    const author = message?.author as Record<string, unknown> | undefined;
    const authorRole = author?.role;
    if (isSkippedMainlineContent(message?.content)) continue;
    const metadata = message?.metadata as Record<string, unknown> | undefined;
    const imageTitle = typeof metadata?.image_gen_title === "string" ? metadata.image_gen_title : "";
    const titledAsset = imageTitle ? assets[imageTitleKey(imageTitle)] : undefined;
    const scopedAssets = titledAsset
      ? { ...assets, ...Object.fromEntries(assetPointers(message?.content).map((pointer) => [pointer, titledAsset])) }
      : assets;
    const content = normalizeContentParts(message?.content, scopedAssets);
    const imageOnlyToolOutput = authorRole === "tool" && content.length > 0 && content.every((part) => part.type !== "text");
    const role = authorRole === "user" ? "user" : authorRole === "assistant" || imageOnlyToolOutput ? "assistant" : null;
    const html = contentPartsHtml(content);
    if (!role || !html.trim()) continue;
    const previous = messages.at(-1);
    if (role === "assistant" && previous?.role === "assistant") {
      previous.content = [...(previous.content || []), ...content];
      previous.html = contentPartsHtml(previous.content);
      continue;
    }
    messages.push({ id: `message-${index + 1}`, role, html, content });
  }
  return messages;
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

export function parseChatGptShareHtml(html: string, sourceUrl?: string, resolvedAssets: ResolvedImageAssets = {}): ExtractedConversation {
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
  const messages = conversation ? messagesFromConversation(conversation, resolvedAssets) : messagesFromRenderedChatGptHtml(html);
  if (!messages.length) throw new Error("ChatGPT returned the conversation metadata, but no user or assistant messages could be decoded.");
  const missingImages = messages.flatMap((message) => message.content || []).filter((part) => part.type === "image_unavailable").length;
  const warnings = [
    "Interactive canvases and files that require a signed-in ChatGPT session cannot be embedded automatically.",
    ...(missingImages ? [`${missingImages} shared image${missingImages === 1 ? "" : "s"} could not be retrieved and will be shown with an explicit placeholder.`] : []),
  ];
  return { title: conversation && typeof conversation.title === "string" ? conversation.title : titleFromHtml(html, "chatgpt"), platform: "chatgpt", sourceUrl, messages, warnings };
}
export const adapters: ConversationAdapter[] = [chatgpt];
