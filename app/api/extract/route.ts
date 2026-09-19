import { adapters } from "@/lib/conversation/adapters";
export async function POST(request: Request) {
  try { const body = await request.json() as { url?: string }; if (!body.url || body.url.length > 2048) return Response.json({ error:"Enter a valid public conversation URL." }, { status:400 }); const url = new URL(body.url); if (url.protocol !== "https:") return Response.json({ error:"Only secure HTTPS share links are supported." }, { status:400 }); const adapter = adapters.find((candidate) => candidate.matches(url)); if (!adapter) return Response.json({ error:"This link is not from a supported platform." }, { status:400 }); return Response.json(await adapter.extract(url)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "The conversation could not be imported.";
    const browserFallback = /HTTP 403|did not allow|embedded conversation payload/i.test(message);
    return Response.json({ error:message, browserFallback }, { status:422 });
  }
}
