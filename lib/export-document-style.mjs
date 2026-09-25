export const exportDocumentCss = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #202123; }
  body {
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
    font-size: 15px; line-height: 1.72; font-weight: 400;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .conversation-document { width: 100%; max-width: none; margin: 0; overflow-wrap: anywhere; }
  .conversation-document-head { padding: 0 0 18px; border-bottom: 1px solid #e5e5e1; }
  .conversation-document-head h3 { margin: 0 0 7px; color: #202123; font-size: 24px; line-height: 1.25; font-weight: 600; letter-spacing: -.018em; }
  .conversation-document-head p { margin: 0; color: #6f706b; font-size: 12px; line-height: 1.5; }
  .conversation-document-head p span { margin: 0 4px; color: #aaa; }
  .conversation-messages { padding-top: 22px; }
  .conversation-message { display: block; width: 100%; height: auto; margin: 0 0 24px; padding: 0 0 24px; border-bottom: 1px solid #ecece8; position: static; overflow: visible; break-inside: auto; }
  .conversation-message:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; }
  .conversation-role { margin: 0 0 7px; color: #343541; font-size: 12px; line-height: 1.4; font-weight: 600; break-after: avoid; }
  .conversation-message.assistant .conversation-role { color: #0f766e; }
  .conversation-message-content { width: 100%; min-width: 0; height: auto; position: static; overflow: visible; }
  .conversation-message-content > :first-child { margin-top: 0; }
  .conversation-message-content > :last-child { margin-bottom: 0; }
  p { margin: 0 0 .9em; orphans: 3; widows: 3; }
  h1, h2, h3, h4 { margin: 1.2em 0 .5em; font-weight: 650; line-height: 1.3; letter-spacing: -.012em; break-after: avoid; }
  h1 { font-size: 23px; } h2 { font-size: 20px; } h3 { font-size: 18px; } h4 { font-size: 16px; }
  ul, ol { margin: .7em 0 1em; padding-left: 1.5em; } li { margin: .25em 0; orphans: 3; widows: 3; }
  strong { font-weight: 600; } a { color: #2563a5; text-decoration-color: #9bb8d9; text-underline-offset: 2px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: .9em; background: #f1f1ef; padding: .14em .32em; border-radius: 4px; }
  pre { display: block; width: 100%; max-width: 100%; height: auto; margin: 12px 0 16px; padding: 12px 14px; border: 1px solid #e2e2de; border-radius: 7px; background: #f4f4f4; color: #202123; white-space: pre-wrap; overflow: visible; overflow-wrap: anywhere; word-break: normal; font-size: 13px; line-height: 1.55; break-inside: auto; }
  pre code { padding: 0; background: transparent; font-size: inherit; }
  blockquote { margin: .9em 0; padding: .05em 0 .05em 15px; border-left: 3px solid #d5d5d0; color: #555; break-inside: avoid; }
  table { width: 100%; margin: 1em 0; border-collapse: collapse; table-layout: fixed; font-size: 13px; break-inside: auto; }
  thead { display: table-header-group; } tr { break-inside: avoid; }
  th, td { padding: 7px 9px; border: 1px solid #d9d9d4; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #f5f5f3; font-weight: 600; }
  figure { margin: 14px 0; break-inside: avoid; }
  img { display: block; width: auto; max-width: 100%; height: auto; max-height: 230mm; margin: 14px auto; object-fit: contain; position: static; break-inside: avoid; }
  hr { margin: 1.35em 0; border: 0; border-top: 1px solid #e5e5e1; }
  .hljs-keyword,.hljs-selector-tag,.hljs-literal { color:#a626a4 } .hljs-string,.hljs-title,.hljs-section { color:#50a14f } .hljs-number,.hljs-symbol { color:#986801 } .hljs-comment,.hljs-quote { color:#6a737d;font-style:italic } .hljs-built_in,.hljs-type { color:#c18401 } .hljs-attr,.hljs-variable { color:#e45649 }
  @page { size: A4 portrait; margin: 17mm 18mm 19mm; }
  @media print {
    html, body { margin: 0; padding: 0; }
    .conversation-document { width: 100%; max-width: none; margin: 0; }
    .conversation-role, h1, h2, h3, h4 { break-after: avoid; }
    blockquote, figure, img { break-inside: avoid; }
    .conversation-message { break-inside: auto; }
  }
`;
