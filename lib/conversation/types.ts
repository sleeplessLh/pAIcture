export type Platform = "chatgpt";
export type ExtractedMessage = { id: string; role: "user" | "assistant"; html: string };
export type ExtractedConversation = { title: string; platform: Platform; sourceUrl?: string; messages: ExtractedMessage[]; warnings?: string[] };
export interface ConversationAdapter { platform: Platform; matches(url: URL): boolean; extract(url: URL): Promise<ExtractedConversation>; }
