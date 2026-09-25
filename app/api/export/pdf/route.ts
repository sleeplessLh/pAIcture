import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { html?: unknown };
    if (typeof body.html !== "string" || body.html.length > 7_500_000) {
      return NextResponse.json({ error: "Invalid export document." }, { status: 400 });
    }
    const extractorUrl = process.env.CHATGPT_EXTRACTOR_URL?.replace(/\/$/, "");
    if (!extractorUrl) return NextResponse.json({ error: "PDF rendering is temporarily unavailable." }, { status: 503 });
    const upstream = await fetch(`${extractorUrl}/render/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CHATGPT_EXTRACTOR_TOKEN ? { Authorization: `Bearer ${process.env.CHATGPT_EXTRACTOR_TOKEN}` } : {}),
      },
      body: JSON.stringify({ html: body.html }),
    });
    if (!upstream.ok) throw new Error(`PDF_RENDERER_${upstream.status}`);
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("PDF export failed", error);
    return NextResponse.json({ error: "Unable to generate this PDF right now." }, { status: 502 });
  }
}
