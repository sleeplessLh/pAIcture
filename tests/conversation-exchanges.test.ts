import assert from "node:assert/strict";
import test from "node:test";
import { groupConversationExchanges, messagesForSelectedExchanges } from "../lib/conversation/exchanges.ts";
import type { ExtractedMessage } from "../lib/conversation/types.ts";

const message = (id: string, role: "user" | "assistant"): ExtractedMessage => ({ id, role, html: `<p>${id}</p>` });

test("groups completed user and assistant exchanges in chronological order", () => {
  const grouped = groupConversationExchanges([
    message("u1", "user"), message("a1", "assistant"),
    message("u2", "user"), message("a2", "assistant"),
    message("u3", "user"), message("a3", "assistant"),
  ]);
  assert.deepEqual(grouped.map((exchange) => exchange.messages.map(({ id }) => id)), [["u1", "a1"], ["u2", "a2"], ["u3", "a3"]]);
});

test("keeps consecutive same-role messages with their exchange", () => {
  const [exchange] = groupConversationExchanges([
    message("u1", "user"), message("u1b", "user"),
    message("a1", "assistant"), message("a1b", "assistant"),
  ]);
  assert.deepEqual(exchange.userMessages.map(({ id }) => id), ["u1", "u1b"]);
  assert.deepEqual(exchange.assistantMessages.map(({ id }) => id), ["a1", "a1b"]);
});

test("omits leading assistant content and an incomplete trailing user turn", () => {
  const grouped = groupConversationExchanges([
    message("system-like", "assistant"),
    message("u1", "user"), message("a1", "assistant"),
    message("unfinished", "user"),
  ]);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].messages.map(({ id }) => id), ["u1", "a1"]);
});

test("selected messages stay in original exchange order, not click order", () => {
  const grouped = groupConversationExchanges([
    message("u1", "user"), message("a1", "assistant"),
    message("u2", "user"), message("a2", "assistant"),
    message("u3", "user"), message("a3", "assistant"),
  ]);
  const selected = messagesForSelectedExchanges(grouped, [grouped[2].id, grouped[0].id]);
  assert.deepEqual(selected.map(({ id }) => id), ["u1", "a1", "u3", "a3"]);
});

test("latest completed exchange is a safe fallback", () => {
  const grouped = groupConversationExchanges([
    message("u1", "user"), message("a1", "assistant"),
    message("u2", "user"), message("a2", "assistant"),
    message("u3", "user"),
  ]);
  assert.deepEqual(grouped.at(-1)?.messages.map(({ id }) => id), ["u2", "a2"]);
});
