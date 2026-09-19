const CHATGPT_SHARE = /^https:\/\/(?:www\.)?chatgpt\.com\/share\/[a-z0-9-]+(?:[/?#].*)?$/i;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "extract") return false;
  extractConversation(message.url).then(
    (conversation) => sendResponse({ conversation }),
    (error) => sendResponse({ error: error instanceof Error ? error.message : "Extraction failed." }),
  );
  return true;
});

async function extractConversation(url) {
  if (!CHATGPT_SHARE.test(url)) throw new Error("The companion currently supports public ChatGPT share links only.");
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitUntilComplete(tab.id);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRenderedChatGPT,
    });
    if (!result?.messages?.length) throw new Error("ChatGPT opened, but no complete public messages were found. The link may be private, expired, or still loading.");
    return result;
  } finally {
    if (tab.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitUntilComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("ChatGPT did not finish loading within 30 seconds."));
    }, 30000);
    const listener = (updatedId, info) => {
      if (updatedId !== tabId || info.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, 1800);
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, 1800);
    });
  });
}

function extractRenderedChatGPT() {
  const allowed = new Set(["P","BR","STRONG","B","EM","I","U","S","UL","OL","LI","BLOCKQUOTE","A","PRE","CODE","TABLE","THEAD","TBODY","TR","TH","TD","H1","H2","H3","H4","HR","IMG","FIGURE","FIGCAPTION","SPAN"]);
  const safeUrl = (value) => {
    try {
      const parsed = new URL(value, location.href);
      return ["http:", "https:", "data:"].includes(parsed.protocol) ? parsed.href : "";
    } catch { return ""; }
  };
  const clean = (root) => {
    const clone = root.cloneNode(true);
    clone.querySelectorAll("button,svg,script,style,[aria-hidden='true']").forEach((node) => node.remove());
    const walk = (node) => {
      for (const child of [...node.children]) {
        walk(child);
        if (!allowed.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          continue;
        }
        const hrefValue = child.getAttribute("href") || "";
        const srcValue = child.getAttribute("src") || "";
        const altValue = child.getAttribute("alt") || "";
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
        if (child.tagName === "A") {
          const href = safeUrl(hrefValue);
          if (href) { child.setAttribute("href", href); child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener noreferrer"); }
        }
        if (child.tagName === "IMG") {
          const src = safeUrl(srcValue);
          if (src) { child.setAttribute("src", src); if (altValue) child.setAttribute("alt", altValue); } else child.remove();
        }
      }
    };
    walk(clone);
    return clone.innerHTML.trim();
  };
  const turns = [...document.querySelectorAll("section[data-testid^='conversation-turn-']")];
  const messages = turns.flatMap((turn, index) => {
    const role = turn.getAttribute("data-turn");
    if (role !== "user" && role !== "assistant") return [];
    const body = turn.querySelector("[data-message-author-role] .markdown") || turn.querySelector("[data-message-author-role]");
    if (!body) return [];
    const html = clean(body);
    return html ? [{ id: `message-${index + 1}`, role, html }] : [];
  });
  return {
    title: document.title.replace(/\s*[|—-]\s*ChatGPT.*$/i, "").trim() || "ChatGPT conversation",
    platform: "chatgpt",
    messages,
    warnings: ["Imported through the pAIcture browser companion because direct server access was blocked. Verify externally hosted images before export."]
  };
}
