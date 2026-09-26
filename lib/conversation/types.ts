export type Platform = "chatgpt";
export type TextContentPart = { type: "text"; html: string };
export type ImageContentPart = {
  type: "image";
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  assetPointer?: string;
};
export type MissingImageContentPart = { type: "image_unavailable"; assetPointer?: string; reason: string };
export type ContentPart = TextContentPart | ImageContentPart | MissingImageContentPart;
export type ExtractedMessage = { id: string; role: "user" | "assistant"; html: string; content?: ContentPart[] };
export type ExtractedConversation = { title: string; platform: Platform; sourceUrl?: string; messages: ExtractedMessage[]; warnings?: string[] };
export interface ConversationAdapter { platform: Platform; matches(url: URL): boolean; extract(url: URL): Promise<ExtractedConversation>; }

export type ResolvedImageAsset = { src: string; alt?: string; width?: number; height?: number };
export type ResolvedImageAssets = Record<string, ResolvedImageAsset>;
