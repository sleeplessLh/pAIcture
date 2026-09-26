const allowedTags = new Set([
  "p","br","strong","b","em","i","u","s","ul","ol","li","blockquote","a","pre","code","table","thead","tbody","tr","th","td","h1","h2","h3","h4","hr","img","figure","figcaption","span",
  // KaTeX's MathML-only output. Keeping this explicit allow-list lets the
  // canonical preview/export sanitizer preserve equations without admitting
  // arbitrary SVG or executable markup.
  "math","semantics","annotation","mrow","mi","mn","mo","mtext","mspace","mfrac","msqrt","mroot","msub","msup","msubsup","munder","mover","munderover","mmultiscripts","mprescripts","none","mtable","mtr","mtd","menclose","mstyle","mpadded","mphantom",
]);
const allowedAttributes = new Set([
  "href", "src", "alt", "title", "class", "colspan", "rowspan",
  "width", "height", "loading", "decoding",
  "xmlns", "display", "encoding", "mathvariant", "mathsize", "displaystyle", "scriptlevel", "stretchy", "symmetric", "fence", "separator", "form", "lspace", "rspace", "depth", "accent", "accentunder", "columnalign", "rowalign", "notation",
]);
export function sanitizeHtml(input: string) {
  return input.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (tag, name, attrs) => {
      const normalized = String(name).toLowerCase();
      if (!allowedTags.has(normalized)) return "";
      if (tag.startsWith("</")) return `</${normalized}>`;
      const safeAttrs = [...String(attrs).matchAll(/([a-z0-9-]+)\s*=\s*("[^"]*"|'[^']*')/gi)]
        .filter(([, key, value]) => allowedAttributes.has(key.toLowerCase()) && !/javascript:|data:text\/html/i.test(value))
        .map(([, key, value]) => ` ${key.toLowerCase()}=${value}`).join("");
      return `<${normalized}${safeAttrs}>`;
    });
}

/**
 * Removes ChatGPT presentation metadata that can be embedded in otherwise
 * human-readable message text. This runs after HTML sanitization and before
 * the canonical document renderer, so preview, PDF, and PNG stay identical.
 */
export function sanitizeForExportHtml(input: string) {
  return sanitizeHtml(input)
    // Preserve a readable URL label/anchor while removing ChatGPT's private-use wrapper.
    .replace(/\uE200url\uE202([^\uE202\uE201]+)\uE202/gu, "$1: ")
    .replace(/(?:|\\ue200)url(?:|\\ue202)([^]+)(?:|\\ue202)/giu, "$1: ")
    // Current ChatGPT citation serialization: citeturn0search0.
    .replace(/\uE200(?:cite|filecite|navlist)\uE202[\s\S]*?\uE201/gu, "")
    // Defensive fallback for escaped/private-use variants observed in exports.
    .replace(/(?:|\\ue200)(?:cite|filecite|navlist)(?:|\\ue202)[\s\S]*?(?:|\\ue201)/giu, "")
    .replace(/\[(?:cite|filecite):[^\]]+\]/giu, "")
    .replace(/[\uE200\uE201\uE202]/gu, "")
    .replace(/<p>\s*<\/p>/giu, "")
    .trim();
}
