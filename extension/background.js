const CHATGPT_CONVERSATION = /^https:\/\/(?:www\.)?chatgpt\.com\/(?:share\/[a-z0-9-]+|c\/[a-z0-9-]+|g\/[^/]+\/c\/[a-z0-9-]+)(?:[/?#].*)?$/i;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "extract") return false;
  extractConversation(message.url).then(
    (conversation) => sendResponse({ conversation }),
    (error) => sendResponse({ error: error instanceof Error ? error.message : "Extraction failed." }),
  );
  return true;
});

async function extractConversation(url) {
  if (!CHATGPT_CONVERSATION.test(url)) throw new Error("Use a ChatGPT conversation URL ending in /c/… or /share/…");
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitUntilComplete(tab.id);
    let previousCount = -1;
    let stablePasses = 0;
    let result;
    for (let attempt = 0; attempt < 20 && stablePasses < 3; attempt += 1) {
      [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractRenderedChatGPT });
      const count = result?.messages?.length || 0;
      stablePasses = count > 0 && count === previousCount ? stablePasses + 1 : 0;
      previousCount = count;
      if (stablePasses < 3) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!result?.messages?.length) throw new Error("ChatGPT opened, but no messages were found. Confirm that you are signed in and can view this conversation in the same browser.");
    if (result.expectedTurns !== result.messages.length) throw new Error(`ChatGPT rendered ${result.expectedTurns} conversation turns, but only ${result.messages.length} could be extracted. Import stopped to prevent silent omissions.`);
    return result;
  } finally {
    if (tab.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitUntilComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("ChatGPT did not finish loading within 45 seconds.")); }, 45000);
    const listener = (updatedId, info) => {
      if (updatedId !== tabId || info.status !== "complete") return;
      clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); setTimeout(resolve, 1200);
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((current) => { if (current.status === "complete") { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); setTimeout(resolve, 1200); } });
  });
}

function extractRenderedChatGPT() {
  const allowed = new Set(["P","BR","STRONG","B","EM","I","U","S","UL","OL","LI","BLOCKQUOTE","A","PRE","CODE","TABLE","THEAD","TBODY","TR","TH","TD","H1","H2","H3","H4","HR","IMG","FIGURE","FIGCAPTION","SPAN"]);
  const safeUrl = (value) => { try { const parsed = new URL(value, location.href); return ["http:","https:","data:"].includes(parsed.protocol) ? parsed.href : ""; } catch { return ""; } };
  const clean = (root) => {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(".katex").forEach((node) => {
      const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
      if (tex) { const replacement = document.createElement("span"); replacement.className = "math-expression"; replacement.textContent = node.closest(".katex-display") ? `\\[${tex}\\]` : `\\(${tex}\\)`; node.replaceWith(replacement); }
    });
    clone.querySelectorAll("button,svg,script,style,[aria-hidden='true']").forEach((node) => node.remove());
    const walk = (node) => {
      for (const child of [...node.children]) {
        walk(child);
        if (!allowed.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
        const hrefValue = child.getAttribute("href") || "";
        const srcValue = child.getAttribute("src") || "";
        const altValue = child.getAttribute("alt") || "";
        const classValue = child.getAttribute("class") || "";
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
        if (child.tagName === "A") { const href = safeUrl(hrefValue); if (href) { child.setAttribute("href", href); child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener noreferrer"); } }
        if (child.tagName === "IMG") { const src = safeUrl(srcValue); if (src) { child.setAttribute("src", src); if (altValue) child.setAttribute("alt", altValue); } else child.remove(); }
        const safeClasses = classValue.split(/\s+/).filter((name) => /^(?:hljs(?:-[a-z-]+)?|language-[a-z0-9-]+|math-expression)$/i.test(name));
        if (safeClasses.length) child.setAttribute("class", safeClasses.join(" "));
      }
    };
    walk(clone);
    return clone.innerHTML.trim();
  };
  const turns = [...document.querySelectorAll("section[data-testid^='conversation-turn-'],article[data-testid^='conversation-turn-']")];
  const expected = turns.filter((turn) => ["user", "assistant"].includes(turn.getAttribute("data-turn") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role"))).length;
  const messages = turns.flatMap((turn, index) => {
    const role = turn.getAttribute("data-turn") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
    if (role !== "user" && role !== "assistant") return [];
    const author = turn.querySelector(`[data-message-author-role="${role}"]`);
    const body = role === "assistant" ? author?.querySelector(".markdown") || author : author?.querySelector(".whitespace-pre-wrap") || author;
    if (!body) return [];
    const html = clean(body);
    return html ? [{ id: `message-${index + 1}`, role, html }] : [];
  });
  const pageTitle = document.querySelector("header h1")?.textContent || document.title.replace(/^ChatGPT\s*[-—|]\s*/i, "").replace(/\s*[-—|]\s*ChatGPT.*$/i, "").trim();
  return { title: pageTitle || "ChatGPT conversation", platform: "chatgpt", expectedTurns: expected, messages, warnings: ["Imported from the selected conversation inside your signed-in browser. pAIcture did not receive your ChatGPT cookies or account credentials."] };
}
