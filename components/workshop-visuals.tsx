import { Check, MessageCircle, Sparkles } from "lucide-react";

export function Sparkle({ className = "" }: { className?: string }) {
  return <span className={`workshop-sparkle ${className}`} aria-hidden="true"><Sparkles /></span>;
}

export function ChatBubble3D({ className = "" }: { className?: string }) {
  return <span className={`chat-bubble-3d ${className}`} aria-hidden="true"><MessageCircle /></span>;
}

export function FloatingPage({ className = "" }: { className?: string }) {
  return <span className={`floating-page ${className}`} aria-hidden="true"><i /><i /><i /></span>;
}

export function DocumentStack({ complete = false, compact = false }: { complete?: boolean; compact?: boolean }) {
  return <div className={`document-stack ${complete ? "is-complete" : ""} ${compact ? "is-compact" : ""}`} aria-hidden="true">
    <span className="document-page document-page-back" />
    <span className="document-page document-page-middle" />
    <span className="document-page document-page-front"><i /><i /><i /><b>{complete ? <Check /> : "p"}</b></span>
    <Sparkle className="stack-sparkle stack-sparkle-one" />
    <Sparkle className="stack-sparkle stack-sparkle-two" />
  </div>;
}

export type JourneyStage = "reading" | "organizing" | "building" | "ready";

const journey = [
  { id: "reading", label: "Read", detail: "Reading your conversation", icon: <MessageCircle /> },
  { id: "organizing", label: "Arrange", detail: "Organizing the messages", icon: <FloatingPage /> },
  { id: "building", label: "Build", detail: "Building your document", icon: <DocumentStack compact /> },
  { id: "ready", label: "Ready", detail: "Your document is ready", icon: <Sparkles /> },
] as const;

export function ProgressJourney({ stage }: { stage: JourneyStage }) {
  const current = journey.findIndex((item) => item.id === stage);
  return <div className="progress-journey" role="status" aria-live="polite">
    <div className="journey-track" aria-hidden="true">
      {journey.map((item, index) => <div className={`journey-stop ${index < current ? "complete" : ""} ${index === current ? "active" : ""}`} key={item.id}>
        <span className="journey-icon">{index < current ? <Check /> : item.icon}</span>
        <span className="journey-label">{item.label}</span>
        {index < journey.length - 1 && <span className="journey-connector"><i /></span>}
      </div>)}
    </div>
    <p>{journey[current]?.detail}</p>
  </div>;
}

export function EmptyDocumentVisual() {
  return <div className="empty-document-visual" aria-hidden="true"><ChatBubble3D /><DocumentStack compact /><Sparkle /></div>;
}
