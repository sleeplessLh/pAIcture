import type { CSSProperties } from "react";

export const documentTheme = {
  fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif',
  monoFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: { body: "15px", small: "12px", code: "13px", title: "24px" },
  lineHeight: { body: 1.7, code: 1.55 },
  spacing: { paragraph: ".9em", message: "26px" },
  page: { width: 794, height: 1123, marginTop: 68, marginX: 68, marginBottom: 68, maxWidth: "760px" },
} as const;

export const documentCssVariables = {
  "--document-font": documentTheme.fontFamily,
  "--document-mono": documentTheme.monoFamily,
  "--document-body-size": documentTheme.fontSize.body,
  "--document-small-size": documentTheme.fontSize.small,
  "--document-code-size": documentTheme.fontSize.code,
  "--document-title-size": documentTheme.fontSize.title,
  "--document-body-leading": documentTheme.lineHeight.body,
  "--document-code-leading": documentTheme.lineHeight.code,
  "--document-paragraph-space": documentTheme.spacing.paragraph,
  "--document-message-space": documentTheme.spacing.message,
} as CSSProperties;
