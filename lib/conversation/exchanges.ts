import type { ExtractedMessage } from "./types";

export type ConversationExchange = {
  id: string;
  index: number;
  messages: ExtractedMessage[];
  userMessages: ExtractedMessage[];
  assistantMessages: ExtractedMessage[];
};

/**
 * Groups a chronological message stream into completed user-to-assistant turns.
 * Consecutive messages with the same role remain in the same exchange. Leading
 * assistant content and incomplete trailing user turns are deliberately omitted.
 */
export function groupConversationExchanges(messages: ExtractedMessage[]): ConversationExchange[] {
  const exchanges: ConversationExchange[] = [];
  let userMessages: ExtractedMessage[] = [];
  let assistantMessages: ExtractedMessage[] = [];

  const finish = () => {
    if (!userMessages.length || !assistantMessages.length) return;
    const index = exchanges.length + 1;
    exchanges.push({
      id: `exchange-${index}-${userMessages[0].id}`,
      index,
      messages: [...userMessages, ...assistantMessages],
      userMessages: [...userMessages],
      assistantMessages: [...assistantMessages],
    });
  };

  for (const message of messages) {
    if (message.role === "user") {
      if (assistantMessages.length) {
        finish();
        userMessages = [];
        assistantMessages = [];
      }
      userMessages.push(message);
      continue;
    }

    // An assistant message is only exportable after at least one user message.
    if (userMessages.length) assistantMessages.push(message);
  }

  finish();
  return exchanges;
}

export function messagesForSelectedExchanges(
  exchanges: ConversationExchange[],
  selectedIds: Iterable<string>,
): ExtractedMessage[] {
  const selected = new Set(selectedIds);
  return exchanges.filter((exchange) => selected.has(exchange.id)).flatMap((exchange) => exchange.messages);
}
