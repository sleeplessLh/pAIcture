import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("../app/mcp/route.ts", import.meta.url), "utf8");
const widgetSource = readFileSync(new URL("../lib/plugin/widget.ts", import.meta.url), "utf8");

test("plugin input contract accepts refreshed exchanges and cached ordered messages", () => {
  assert.match(routeSource, /anyOf: \[\{ required: \["exchanges"\] \}, \{ required: \["messages"\] \}\]/);
  assert.match(routeSource, /question: \{ \$ref: "#\/\$defs\/MessageContent" \}/);
  assert.match(routeSource, /answer: \{ \$ref: "#\/\$defs\/MessageContent" \}/);
  assert.match(routeSource, /Exclude the command that invoked pAIcture/);
  assert.match(routeSource, /Backward-compatible complete conversation messages/);
});

test("plugin contract preserves explicit pairs and deterministically groups cached message arrays", () => {
  assert.match(routeSource, /const candidates: unknown\[\] = hasExplicitExchanges \? explicitCandidates : legacyCandidates/);
  assert.match(routeSource, /message\.role === "assistant" && pendingUser/);
  assert.match(routeSource, /A final unmatched export instruction is not exportable conversation content/);
  assert.match(routeSource, /messages: \[normalizeMessage\(item\.question, "user", exchangeId\), normalizeMessage\(item\.answer, "assistant", exchangeId\)\]/);
  assert.match(routeSource, /never summarize, shorten, merge, invent, or silently omit/);
});

test("widget defaults to the latest complete exchange and keeps all selection modes", () => {
  assert.match(widgetSource, /const latest=latestCompleteId\(\);exchanges\.forEach\(x=>x\.selected=x\.id===latest\)/);
  assert.match(widgetSource, /mode\('all'\)/);
  assert.match(widgetSource, /mode\('clear'\)/);
  assert.match(widgetSource, /mode\('latest'\)/);
});
