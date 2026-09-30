import { NextResponse } from "next/server";

const privateResponseHeaders = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body: { html?: unknown; config?: { paper?: unknown; orientation?: unknown; composition?: unknown; slices?: unknown; sourceHeight?: unknown }; filename?: unknown };
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const configText = form.get("config");
      body = {
        html: form.get("html"),
        config: typeof configText === "string" ? JSON.parse(configText) : undefined,
        filename: form.get("filename"),
      };
    } else body = await request.json();
    if (typeof body.html !== "string" || body.html.length > 7_500_000) {
      return NextResponse.json({ error: "Invalid export document." }, { status: 400, headers: privateResponseHeaders });
    }
    const extractorUrl = process.env.CHATGPT_EXTRACTOR_URL?.replace(/\/$/, "");
    if (!extractorUrl) return NextResponse.json({ error: "PDF rendering is temporarily unavailable." }, { status: 503, headers: privateResponseHeaders });
    if (!process.env.CHATGPT_EXTRACTOR_TOKEN) return NextResponse.json({ error: "PDF rendering is temporarily unavailable." }, { status: 503, headers: privateResponseHeaders });
    const upstream = await fetch(`${extractorUrl}/render/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CHATGPT_EXTRACTOR_TOKEN ? { Authorization: `Bearer ${process.env.CHATGPT_EXTRACTOR_TOKEN}` } : {}),
      },
      body: JSON.stringify({ html: body.html, config: body.config }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!upstream.ok) throw new Error(`PDF_RENDERER_${upstream.status}`);
    const filename = typeof body.filename === "string"
      ? body.filename.normalize("NFKC").replace(/[^a-z0-9._-]+/gi, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 100)
      : "paicture-chatgpt-export.pdf";
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename || "paicture-chatgpt-export.pdf"}"`,
        ...privateResponseHeaders,
      },
    });
  } catch (error) {
    console.error("PDF export failed", error);
    return NextResponse.json({ error: "Unable to generate this PDF right now." }, { status: 502, headers: privateResponseHeaders });
  }
}
