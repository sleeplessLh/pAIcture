window.addEventListener("message", async (event) => {
  if (event.source !== window || event.data?.source !== "paicture-web") return;
  if (event.data?.type === "ping") {
    window.postMessage({ source: "paicture-companion", type: "ready", requestId: event.data.requestId }, location.origin);
    return;
  }
  if (event.data?.type !== "extract" && event.data?.type !== "consume") return;
  const requestId = event.data.requestId;
  try {
    const response = await chrome.runtime.sendMessage({ type: event.data.type, url: event.data.url, transferId: event.data.transferId });
    window.postMessage({ source: "paicture-companion", type: "result", requestId, ...response }, location.origin);
  } catch (error) {
    window.postMessage({ source: "paicture-companion", type: "result", requestId, error: error instanceof Error ? error.message : "The companion could not read this page." }, location.origin);
  }
});

window.postMessage({ source: "paicture-companion", type: "ready" }, location.origin);
