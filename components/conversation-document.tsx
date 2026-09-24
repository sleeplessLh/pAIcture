import { forwardRef } from "react";
import { documentCssVariables } from "@/lib/document-theme";

type Message = { id: string; role: "user" | "assistant"; html: string };
type Props = { title: string; platformName: string; messages: Message[]; dateLabel: string };

export const ConversationDocument = forwardRef<HTMLDivElement, Props>(function ConversationDocument(
  { title, platformName, messages, dateLabel },
  ref,
) {
  return (
    <div className="conversation-document" ref={ref} style={documentCssVariables}>
      <header className="conversation-document-head">
        <h3>{title}</h3>
        <p>{platformName} conversation <span aria-hidden="true">·</span> {dateLabel}</p>
      </header>
      <div className="conversation-messages">
        {messages.map((message) => (
          <article className={`conversation-message ${message.role}`} key={message.id}>
            <div className="conversation-role">{message.role === "user" ? "You" : platformName}</div>
            <div className="conversation-message-content" dangerouslySetInnerHTML={{ __html: message.html }} />
          </article>
        ))}
      </div>
    </div>
  );
});
