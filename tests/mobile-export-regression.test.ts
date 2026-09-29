import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const exportCss = readFileSync(new URL("../lib/export-document-style.mjs", import.meta.url), "utf8");

test("PDF pagination uses measurement without invoking the raster renderer", () => {
  const pdfBranch = pageSource.slice(pageSource.indexOf('if (format === "pdf")'), pageSource.indexOf("const captureScale = 2"));
  assert.match(pdfBranch, /measureDocumentPages\(source, exportConfig\)/);
  assert.doesNotMatch(pdfBranch, /renderDocumentPages|html2canvas/);
});

test("mobile capture keeps deterministic desktop document geometry", () => {
  assert.match(pageSource, /windowWidth: Math\.max\(1440, pageWidth\)/);
  assert.match(appCss, /\.conversation-document\.export-capture \.conversation-document-meta\{grid-template-columns:1fr auto auto/);
  assert.match(appCss, /\.conversation-document\.export-capture \.conversation-document-head h3\{font-size:var\(--document-title-size\)\}/);
});

test("export surfaces avoid unsupported modern color functions", () => {
  assert.doesNotMatch(exportCss, /color-mix\(|oklch\(|lab\(|lch\(|\bcolor\(/);
  assert.match(appCss, /\.conversation-document\.export-capture \.conversation-message-content a\{text-decoration-color:rgba\(/);
});
