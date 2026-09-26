import { NextResponse } from "next/server";
import { adapters, parseChatGptShareHtml } from "../../../../lib/conversation/adapters";
import type { ResolvedImageAssets } from "../../../../lib/conversation/types";

const friendlyError = "Unable to import this shared conversation. Please make sure this is a valid ChatGPT shared conversation link and that it is still publicly accessible.";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== "string") return NextResponse.json({ error: friendlyError }, { status: 400 });
    const url = new URL(body.url.trim());
    const adapter = adapters[0];
    if (!adapter.matches(url)) return NextResponse.json({ error: friendlyError }, { status: 400 });
    console.info("[IMPORT] URL validated", { host: url.host });
    const extractorUrl = process.env.CHATGPT_EXTRACTOR_URL?.replace(/\/$/, "");
    let conversation;
    if (extractorUrl) {
      console.info("[IMPORT] Retrieval strategy: dedicated Node extractor");
      const response = await fetch(`${extractorUrl}/retrieve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.CHATGPT_EXTRACTOR_TOKEN ? { Authorization: `Bearer ${process.env.CHATGPT_EXTRACTOR_TOKEN}` } : {}),
        },
        body: JSON.stringify({ url: url.toString() }),
      });
      if (!response.ok) throw new Error(`EXTRACTOR_${response.status}`);
      const payload = await response.json() as { html?: unknown; assets?: unknown; assetWarnings?: unknown };
      if (typeof payload.html !== "string") throw new Error("EXTRACTOR_INVALID_PAYLOAD");
      console.info("[IMPORT] Response received", { bytes: payload.html.length });
      const assets = payload.assets && typeof payload.assets === "object" ? payload.assets as ResolvedImageAssets : {};
      console.info("[IMAGE] Resolved shared assets", { count: Object.keys(assets).length });
      conversation = parseChatGptShareHtml(payload.html, url.toString(), assets);
      if (Array.isArray(payload.assetWarnings)) conversation.warnings = [...(conversation.warnings || []), ...payload.assetWarnings.filter((item): item is string => typeof item === "string")];
    } else {
      console.info("[IMPORT] Retrieval strategy: direct structured page fetch");
      conversation = await adapter.extract(url);
    }
    const userMessages = conversation.messages.filter((message) => message.role === "user").length;
    console.info("[IMPORT] Conversation discovered", { title: conversation.title, messages: conversation.messages.length, userMessages, assistantMessages: conversation.messages.length - userMessages });
    console.info("[IMPORT] Normalization complete", { elapsedMs: Date.now() - startedAt });
    return NextResponse.json(conversation);
  } catch (error) {
    // Keep network/debug detail in server logs, never in the primary UI.
    console.error("ChatGPT shared-link import failed", error);
    return NextResponse.json({ error: friendlyError }, { status: 422 });
  }
}
