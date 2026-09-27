import { forwardRef } from "react";
import { documentCssVariables } from "@/lib/document-theme";
import { sanitizeForExportHtml } from "@/lib/conversation/sanitize";
import { groupConversationExchanges } from "@/lib/conversation/exchanges";

type Message = { id: string; role: "user" | "assistant"; html: string };
type Props = { title: string; platformName: string; messages: Message[]; dateLabel: string; appearance?: "light" | "dark" };

function DocumentMessage({ message }: { message: Message }) {
  return <div className="conversation-message-content" dangerouslySetInnerHTML={{ __html: sanitizeForExportHtml(message.html) }} />;
}

export const ConversationDocument = forwardRef<HTMLDivElement, Props>(function ConversationDocument(
  { title, platformName, messages, dateLabel, appearance = "light" },
  ref,
) {
  const exchanges = groupConversationExchanges(messages);
  return (
    <div className="conversation-document" data-appearance={appearance} ref={ref} style={documentCssVariables}>
      <header className="conversation-document-head">
        <div className="conversation-document-brand"><span>pAIcture</span><i aria-hidden="true" /></div>
        <p className="conversation-document-kicker">AI conversation document</p>
        <h3>{title}</h3>
        <div className="conversation-document-meta">
          <span><small>Exported</small>{dateLabel}</span>
          <span><small>Source</small>{platformName}</span>
          <span><small>Selected</small>{exchanges.length} {exchanges.length === 1 ? "exchange" : "exchanges"}</span>
        </div>
      </header>
      <div className="conversation-messages">
        {exchanges.map((exchange, index) => <section className="conversation-exchange" key={exchange.id}>
          <header className="conversation-question-heading">
            <span className="conversation-exchange-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="conversation-question-label">Question</span>
          </header>
          <article className="conversation-message user">
            <div className="conversation-role">You</div>
            {exchange.userMessages.map((message) => <DocumentMessage message={message} key={message.id} />)}
          </article>
          <article className="conversation-message assistant">
            <div className="conversation-role">{platformName}</div>
            {exchange.assistantMessages.map((message) => <DocumentMessage message={message} key={message.id} />)}
          </article>
        </section>)}
      </div>
    </div>
  );
});
