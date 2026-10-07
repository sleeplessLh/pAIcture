export const exportDocumentCss = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fbfaf7; color: #232321; }
  body:has(.conversation-document[data-appearance="dark"]) { background:#202225; }
  body { font-family: "Noto Sans SC Variable", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif; font-size: 14.75px; line-height: 1.74; font-weight: 400; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .conversation-document { --paper:#fbfaf7;--ink:#232321;--muted:#74736d;--faint:#aaa79f;--rule:#dcd9d1;--accent:#ad4c38;--accent-soft:#f4ebe6;--code:#f1f0ec;--quote:#f5f3ee;--table:#f2f0eb; width: 100%; max-width: none; margin: 0; color: var(--ink); background: var(--paper); overflow-wrap: anywhere; }
  .conversation-document[data-appearance="dark"] { --paper:#202225;--ink:#f1eee7;--muted:#b1ada5;--faint:#817f79;--rule:#424348;--accent:#e9967d;--accent-soft:#342a28;--code:#292b2f;--quote:#282a2d;--table:#2b2d31;position:relative; }
  .conversation-document-head { padding: 0 0 24px; border-bottom: 1px solid var(--rule); break-after: avoid; }
  .conversation-document-brand { display:flex;align-items:center;gap:10px;margin:0 0 30px;color:var(--ink);font-size:11px;line-height:1;text-transform:uppercase;letter-spacing:.16em;font-weight:700; }
  .conversation-document-brand i { display:block;width:34px;height:1px;background:var(--accent); }
  .conversation-document-kicker { margin:0 0 8px;color:var(--accent);font-size:10px;line-height:1.4;text-transform:uppercase;letter-spacing:.15em;font-weight:700; }
  .conversation-document-head h3 { max-width:650px;margin:0 0 24px;color:var(--ink);font-size:28px;line-height:1.23;font-weight:650;letter-spacing:-.025em; }
  .conversation-document-meta { display:grid;grid-template-columns:1fr auto auto;gap:28px;color:var(--ink);font-size:10.5px;line-height:1.45; }
  .conversation-document-meta span { display:flex;flex-direction:column;gap:2px; }
  .conversation-document-meta small { color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.13em;font-weight:700; }
  .conversation-messages { padding-top:34px; }
  .conversation-exchange { margin:0 0 38px;padding:0 0 38px;border-bottom:1px solid var(--rule);break-inside:auto; }
  .conversation-exchange:last-child { margin-bottom:0;padding-bottom:0;border-bottom:0; }
  .conversation-question-heading { display:flex;align-items:center;gap:10px;margin:0 0 10px;color:var(--muted);font-size:9px;line-height:1.3;text-transform:uppercase;letter-spacing:.14em;font-weight:700;break-after:avoid; }
  .conversation-exchange-number { display:grid;place-items:center;width:25px;height:25px;border:1px solid var(--accent);border-radius:50%;color:var(--accent);font-size:9px;letter-spacing:0; }
  .conversation-question-label:after { content:"";display:inline-block;width:36px;height:1px;margin:0 0 3px 10px;background:var(--rule); }
  .conversation-message { display:block;width:100%;height:auto;position:static;overflow:visible;break-inside:auto; }
  .conversation-message.user { margin:0 0 24px;padding:0 0 24px;border-bottom:1px solid var(--rule);break-after:avoid-page; }
  .conversation-message.assistant { margin:0;padding:0; }
  .conversation-role { margin:0 0 8px;color:var(--muted);font-size:9px;line-height:1.4;text-transform:uppercase;letter-spacing:.14em;font-weight:700;break-after:avoid; }
  .conversation-message.user .conversation-role { color:var(--accent); }
  .conversation-message.user .conversation-message-content { max-width:650px;color:var(--ink);font-size:18px;line-height:1.52;font-weight:560;letter-spacing:-.012em; }
  .conversation-message.assistant .conversation-message-content { max-width:680px;color:var(--ink); }
  .conversation-message-content { width:100%;min-width:0;height:auto;position:static;overflow:visible; }
  .conversation-message-content + .conversation-message-content { margin-top:12px; }
  .conversation-message-content > :first-child { margin-top:0; }
  .conversation-message-content > :last-child { margin-bottom:0; }
  p { margin:0 0 .88em;orphans:3;widows:3; }
  h1,h2,h3,h4 { margin:1.35em 0 .48em;color:var(--ink);font-weight:650;line-height:1.3;letter-spacing:-.018em;break-after:avoid; }
  h1{font-size:23px} h2{font-size:19px} h3{font-size:16.5px} h4{font-size:14.75px}
  ul,ol { margin:.65em 0 1em;padding-left:1.4em; } li{margin:.22em 0;orphans:3;widows:3;} li::marker{color:var(--accent);font-weight:650}
  strong{font-weight:650} em{font-style:italic} a{color:var(--accent);text-decoration-color:rgba(173,76,56,.48);text-underline-offset:3px}[data-appearance="dark"] a{text-decoration-color:rgba(233,150,125,.48)}
  code { font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Noto Sans SC Variable","Noto Sans CJK SC","Microsoft YaHei",monospace;font-size:.9em;background:var(--code);padding:.14em .34em;border-radius:3px; }
  pre { display:block;width:100%;max-width:100%;height:auto;margin:15px 0 19px;padding:30px 16px 15px;border:1px solid var(--rule);border-radius:6px;background:var(--code);color:var(--ink);white-space:pre-wrap;overflow:visible;overflow-wrap:anywhere;word-break:normal;font-size:12.5px;line-height:1.58;position:relative;break-inside:auto; }
  pre:before { content:"CODE";position:absolute;top:9px;left:16px;color:var(--muted);font:700 8px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.15em; }
  pre code { padding:0;background:transparent;font-size:inherit; }
  blockquote { margin:1em 0;padding:.6em 0 .6em 17px;border-left:2px solid var(--accent);color:var(--muted);background:linear-gradient(90deg,var(--quote),transparent 70%);break-inside:avoid; }
  blockquote p:last-child{margin-bottom:0}
  table { width:100%;margin:1.15em 0;border-collapse:collapse;table-layout:fixed;font-size:12.5px;break-inside:auto; }
  thead{display:table-header-group} tr{break-inside:avoid} th,td{padding:9px 10px;border:0;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top;overflow-wrap:anywhere} th{background:var(--table);color:var(--ink);font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700} tbody tr:last-child td{border-bottom:0}
  figure{margin:18px 0 20px;break-inside:avoid} img{display:block;width:auto;max-width:100%;height:auto;max-height:220mm;margin:0 auto;object-fit:contain;position:static;break-inside:avoid}
  .conversation-image{padding:8px;border:1px solid var(--rule);border-radius:8px;background:var(--code);break-inside:avoid}.conversation-image img{margin:0 auto;max-width:82%;max-height:145mm;border-radius:4px}.conversation-image:after{content:"Generated with ChatGPT";display:block;margin:8px 2px 1px;color:var(--muted);font-size:8.5px;line-height:1.4;text-transform:uppercase;letter-spacing:.1em}
  .conversation-image-unavailable{display:grid;gap:4px;margin:14px 0;padding:12px 14px;border:1px solid var(--rule);border-radius:6px;background:var(--code);color:var(--muted);break-inside:avoid}.conversation-image-unavailable strong{color:var(--ink)}.conversation-image-unavailable span{font-size:12px;line-height:1.5}
  hr{margin:1.45em 0;border:0;border-top:1px solid var(--rule)}
  .math-expression{padding:0;background:transparent;white-space:normal}.math-display{display:block;margin:1em 0;text-align:center;overflow:visible;break-inside:avoid}.math-inline{display:inline-block;vertical-align:-.12em}.katex-mathml{font-family:"Cambria Math","STIX Two Math","Noto Sans Math","Noto Sans SC Variable",serif}.katex-mathml mtext{font-family:"Noto Sans SC Variable","Noto Sans CJK SC","Microsoft YaHei",sans-serif}.katex-mathml mi,.katex-mathml mn,.katex-mathml mo{font-family:"Cambria Math","STIX Two Math","Noto Sans Math","Noto Sans SC Variable",serif} math{font-size:1.08em} annotation{display:none!important}
  .hljs-keyword,.hljs-selector-tag,.hljs-literal{color:#9c3d75}.hljs-string,.hljs-title,.hljs-section{color:#47734a}.hljs-number,.hljs-symbol{color:#8a5b20}.hljs-comment,.hljs-quote{color:var(--muted);font-style:italic}.hljs-built_in,.hljs-type{color:#8c5d24}.hljs-attr,.hljs-variable{color:#a44b3d}
  [data-appearance="dark"] .hljs-keyword,[data-appearance="dark"] .hljs-selector-tag,[data-appearance="dark"] .hljs-literal{color:#d995c0}[data-appearance="dark"] .hljs-string,[data-appearance="dark"] .hljs-title,[data-appearance="dark"] .hljs-section{color:#9fc89f}[data-appearance="dark"] .hljs-number,[data-appearance="dark"] .hljs-symbol{color:#d7af78}[data-appearance="dark"] .hljs-built_in,[data-appearance="dark"] .hljs-type{color:#d4ae79}[data-appearance="dark"] .hljs-attr,[data-appearance="dark"] .hljs-variable{color:#e59a87}
  @page{size:A4 portrait;margin:25.4mm}
  @media print{html,body{margin:0;padding:0}.conversation-document{width:100%;max-width:none;margin:0}.conversation-document[data-appearance="dark"]:before{content:"";position:fixed;inset:-18mm;background:#202225;z-index:-1}.conversation-document-head,.conversation-question-heading,.conversation-role,h1,h2,h3,h4{break-after:avoid}.conversation-message.user{break-inside:avoid}.conversation-message.assistant>.conversation-message-content:first-of-type>:first-child{break-before:avoid}blockquote,figure,img{break-inside:avoid}.conversation-message,.conversation-exchange{break-inside:auto}}
`;
