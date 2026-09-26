import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../lib/conversation/adapters.ts";
import { sanitizeForExportHtml } from "../lib/conversation/sanitize.ts";

test("renders ChatGPT display-math delimiters as accessible MathML", () => {
  const output = renderMarkdown("Before\n\n\\[\\boxed{f_{w,b}(x)=wx+b}\\]\n\nAfter");
  assert.match(output, /class="math-expression math-display"/);
  assert.match(output, /<math/);
  assert.match(output, /<annotation encoding="application\/x-tex">\\boxed\{f_\{w,b\}\(x\)=wx\+b\}<\/annotation>/);
  assert.doesNotMatch(output, /PAICTUREMATH/);
});

test("renders inline parenthesized math without changing currency", () => {
  const output = renderMarkdown("For \\(x=1.2\\), the result costs $200,000.");
  assert.match(output, /class="math-expression math-inline"/);
  assert.match(output, /\$200,000/);
  assert.doesNotMatch(output, /PAICTUREMATH/);
});

test("renders double-dollar display math", () => {
  const output = renderMarkdown("$$w=200$$");
  assert.match(output, /class="math-expression math-display"/);
  assert.match(output, /<mn>200<\/mn>/);
});

test("preserves KaTeX MathML through the canonical export sanitizer", () => {
  const output = sanitizeForExportHtml(renderMarkdown("\\[\\boxed{f_{w,b}(x)=wx+b}\\]"));
  assert.match(output, /<math[^>]+display="block"/);
  assert.match(output, /<menclose notation="box">/);
  assert.match(output, /<annotation encoding="application\/x-tex">/);
  assert.doesNotMatch(output, /<script|<svg/i);
});
