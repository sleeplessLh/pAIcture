import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const exportCss = readFileSync(new URL("../lib/export-document-style.mjs", import.meta.url), "utf8");
const importRoute = readFileSync(new URL("../app/api/import/chatgpt/route.ts", import.meta.url), "utf8");
const exportRoute = readFileSync(new URL("../app/api/export/pdf/route.ts", import.meta.url), "utf8");
const extractorSource = readFileSync(new URL("../server/extractor.mjs", import.meta.url), "utf8");

test("PDF pagination uses measurement without invoking the raster renderer", () => {
  const pdfBranch = pageSource.slice(pageSource.indexOf('if (format === "pdf")'), pageSource.indexOf("const captureScale = 2"));
  assert.match(pdfBranch, /measureDocumentPages\(source, exportConfig\)/);
  assert.match(pdfBranch, /preparePdfHtml\(source\)/);
  assert.match(pdfBranch, /exportHtml\.length > 3_600_000/);
  assert.doesNotMatch(pdfBranch, /renderDocumentPages|html2canvas/);
});

test("image-heavy PDF transport is compressed before crossing the Vercel body limit", () => {
  assert.match(pageSource, /const imageBudget = 2_700_000/);
  assert.match(pageSource, /compressImageForPdf\(image\.src, perImageBudget\)/);
  assert.match(pageSource, /response\.status === 413/);
});

test("mobile preview uses a fixed low-memory raster scale and releases canvases", () => {
  assert.match(pageSource, /renderDocumentPages\(previewRef\.current!, exportConfig, \.65\)/);
  assert.match(pageSource, /canvas\.width = 1; canvas\.height = 1/);
});

test("image-heavy imports resolve assets concurrently within cold-start timeouts", () => {
  assert.match(extractorSource, /mapWithConcurrency\(pointers, 4/);
  assert.match(extractorSource, /mapWithConcurrency\(renderedImages, 4/);
  assert.match(importRoute, /AbortSignal\.timeout\(112_000\)/);
  assert.match(pageSource, /controller\.abort\(\), 125_000/);
});

test("iOS receives the completed file without suspending export in a blank tab", () => {
  assert.match(pageSource, /if \(isIosBrowser\(\)\) \{\s*window\.location\.assign\(href\)/);
  assert.doesNotMatch(pageSource, /window\.open\(/);
});

test("mobile PDF uses a native form navigation instead of an asynchronous Blob download", () => {
  assert.match(pageSource, /form\.enctype = "multipart\/form-data"/);
  assert.match(pageSource, /if \(isMobileBrowser\(\)\)/);
  assert.match(pageSource, /submitPdfToNativeViewer\(exportHtml, pdfConfig/);
  assert.match(exportRoute, /request\.formData\(\)/);
  assert.match(exportRoute, /Content-Disposition/);
});

test("preview initially shows three pages and provides an explicit expand-collapse control", () => {
  assert.match(pageSource, /previewPages\.slice\(0, 3\)/);
  assert.match(pageSource, /Expand all \$\{previewPages\.length\} pages/);
  assert.match(pageSource, /Collapse to first 3 pages/);
});

test("1-in-1 PDF uses native print pagination without cloning the whole document per page", () => {
  assert.match(extractorSource, /if \(slices\.length && composition > 1\)/);
  assert.match(extractorSource, /Native 1-in-1 pagination/);
  assert.match(pageSource, /pdfController\.abort\(\), 125_000/);
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
