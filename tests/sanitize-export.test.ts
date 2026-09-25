import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeForExportHtml } from "../lib/conversation/sanitize.ts";

test("removes ChatGPT internal citation serialization", () => {
  const input = "<p>MVCC 内容\uE200cite\uE202turn0search2\uE202turn0search4\uE201继续阅读。</p>";
  const output = sanitizeForExportHtml(input);
  assert.equal(output, "<p>MVCC 内容继续阅读。</p>");
  assert.doesNotMatch(output, /cite|turn0search|\uE200|\uE201|\uE202/u);
});

test("preserves legitimate human-readable text and markup", () => {
  const input = '<h2>引用与代码</h2><p>用户写了 <code>cite()</code>，并链接到 <a href="https://example.com">example</a>。</p>';
  assert.equal(sanitizeForExportHtml(input), input);
});

test("removes bracketed internal markers conservatively", () => {
  assert.equal(sanitizeForExportHtml("<p>Before [filecite:abc123] after</p>"), "<p>Before  after</p>");
});

test("removes URL serialization wrappers but preserves the readable label and link", () => {
  const input = '<p>来源：\uE200url\uE202OpenAI\uE202<a href="https://openai.com">https://openai.com</a>\uE201</p>';
  const output = sanitizeForExportHtml(input);
  assert.equal(output, '<p>来源：OpenAI: <a href="https://openai.com">https://openai.com</a></p>');
  assert.doesNotMatch(output, /[\uE200\uE201\uE202]/u);
});
