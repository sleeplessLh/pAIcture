import type { CSSProperties } from "react";

export const documentTheme = {
  fontFamily: '"Noto Sans SC Variable", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif',
  monoFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: { body: "14.75px", small: "10.5px", code: "12.5px", title: "28px", question: "18px" },
  lineHeight: { body: 1.74, code: 1.58 },
  spacing: { paragraph: ".88em", message: "22px", exchange: "38px" },
  page: { width: 794, height: 1123, marginTop: 96, marginX: 96, marginBottom: 96, maxWidth: "760px" },
} as const;

export const documentCssVariables = {
  "--document-font": documentTheme.fontFamily,
  "--document-mono": documentTheme.monoFamily,
  "--document-body-size": documentTheme.fontSize.body,
  "--document-small-size": documentTheme.fontSize.small,
  "--document-code-size": documentTheme.fontSize.code,
  "--document-title-size": documentTheme.fontSize.title,
  "--document-question-size": documentTheme.fontSize.question,
  "--document-body-leading": documentTheme.lineHeight.body,
  "--document-code-leading": documentTheme.lineHeight.code,
  "--document-paragraph-space": documentTheme.spacing.paragraph,
  "--document-message-space": documentTheme.spacing.message,
  "--document-exchange-space": documentTheme.spacing.exchange,
} as CSSProperties;
