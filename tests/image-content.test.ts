import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContentParts, parseChatGptShareHtml } from "../lib/conversation/adapters.ts";

const pointer = "sediment://file_generated123?shared_conversation_id=share-123";

test("preserves text and generated images in their original order", () => {
  const parts = normalizeContentParts({
    content_type: "multimodal_text",
    parts: [
      "Here is the first image.",
      { content_type: "image_asset_pointer", asset_pointer: pointer },
      "And the explanation after it.",
    ],
  }, {
    [pointer]: { src: "data:image/png;base64,aGVsbG8=", alt: "Generated city", width: 1536, height: 1024 },
  });

  assert.deepEqual(parts.map((part) => part.type), ["text", "image", "text"]);
  assert.equal(parts[1].type === "image" && parts[1].src, "data:image/png;base64,aGVsbG8=");
  assert.equal(parts[1].type === "image" && parts[1].width, 1536);
  assert.equal(parts[1].type === "image" && parts[1].height, 1024);
});

test("supports multiple generated images inside one assistant message", () => {
  const second = "sediment://file_generated456?shared_conversation_id=share-123";
  const parts = normalizeContentParts({ parts: [
    { asset_pointer: pointer },
    { asset_pointer: second },
  ] }, {
    [pointer]: { src: "data:image/webp;base64,YQ==" },
    [second]: { src: "data:image/png;base64,Yg==" },
  });
  assert.deepEqual(parts.map((part) => part.type), ["image", "image"]);
});

test("keeps an explicit unavailable-image part when public resolution fails", () => {
  const [part] = normalizeContentParts({ parts: [{ asset_pointer: pointer }] });
  assert.equal(part.type, "image_unavailable");
  assert.equal(part.type === "image_unavailable" && part.assetPointer, pointer);
});

test("accepts public HTTPS image content without an asset resolver", () => {
  const [part] = normalizeContentParts({ parts: [{ image_url: "https://cdn.example.test/generated.webp", width: 1024, height: 1024 }] });
  assert.equal(part.type, "image");
  assert.equal(part.type === "image" && part.src, "https://cdn.example.test/generated.webp");
});

test("turns image-generation tool output into assistant content and removes skipped-mainline markers", () => {
  const conversation = {
    title: "Generated image test",
    current_node: "image",
    mapping: {
      user: {
        parent: null,
        message: { author: { role: "user" }, content: { parts: ["Create an image"] } },
      },
      skipped: {
        parent: "user",
        message: { author: { role: "assistant" }, content: { content_type: "code", language: "python3", text: '{"skipped_mainline":true}' } },
      },
      image: {
        parent: "skipped",
        message: {
          author: { role: "tool" },
          content: { content_type: "multimodal_text", parts: [{ content_type: "image_asset_pointer", asset_pointer: pointer }] },
          metadata: { image_gen_title: "Generated city" },
        },
      },
    },
  };
  const serialized = JSON.stringify(JSON.stringify(conversation));
  const parsed = parseChatGptShareHtml(`<script>window.__reactRouterContext.streamController.enqueue(${serialized})</script>`, undefined, {
    "image-title:generated city": { src: "data:image/png;base64,aGVsbG8=" },
  });

  assert.deepEqual(parsed.messages.map((message) => message.role), ["user", "assistant"]);
  assert.deepEqual(parsed.messages[1].content?.map((part) => part.type), ["image"]);
  assert.doesNotMatch(parsed.messages[1].html, /skipped_mainline/);
});
