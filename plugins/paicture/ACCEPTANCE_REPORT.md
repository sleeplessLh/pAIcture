# pAIcture plugin export acceptance report

Date: 2026-10-01 (Asia/Singapore)

Scope: local plugin build only. No commit, saved Site version, deployment, or plugin publication was performed.

## Fixture

The browser fixture contained three complete user → assistant exchanges with:

- headings and normal English and Chinese paragraphs;
- bullet and numbered lists;
- a Markdown table and blockquote;
- inline code and a JavaScript code block;
- a link and the mathematical text `E = mc²`;
- a long, repeated multi-paragraph answer requiring automatic pagination.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Short conversation | Pass | Default state selected only exchange 3 and produced one A4 preview page. |
| Long conversation | Pass | Selecting all exchanges produced five A4 portrait document pages without scaling the full conversation into one page. |
| Multiple exchanges | Pass | Exchanges 1 and 2 could be selected together while exchange 3 was excluded; chronological order was preserved by the source-order pagination pipeline. |
| Select All | Pass | Selection changed to 3 of 3 and preview regenerated to five pages. |
| Clear All | Pass | Selection changed to 0 of 3 and preview was replaced by the empty-selection state. |
| Latest Only | Pass | Selection returned to 1 of 3 with only the last complete exchange checked. |
| PDF | Pass | PDF generation completed and exposed a downloadable PDF through the ChatGPT file bridge; fallback browser generation also completed. |
| PNG | Pass | PNG generation completed for every final sheet and exposed downloadable PNG files through the ChatGPT file bridge; fallback browser generation also completed. |
| Preview versus download | Pass | Preview and both exporters consume the same in-memory final-sheet canvases. No second layout or scaling pass is used for download. |
| Mobile viewport | Pass | At 390 × 844 CSS pixels, body width stayed within the viewport, controls remained at least 36 px high, export buttons were 44 px high, and the preview width was 359 px with no horizontal overflow. |
| Paper/orientation/appearance | Pass | A4/Letter, portrait/landscape, and light/dark changes each regenerated the final-page preview. |
| 1-in-1 / 2-in-1 / 4-in-1 | Pass | 2-in-1 converted six landscape document pages into three download sheets; 4-in-1 converted five Letter pages into two sheets. |
| Mixed formatting | Pass | Headings, paragraphs, lists, table, blockquote, inline code, code block, link, math text, English, and Chinese all rendered through the final canvas pipeline. |
| Readability and clipping | Pass | Export body is 18 px at 1.68 line height with fixed page margins; code wraps, tables wrap cell content, and overflow creates continuation pages instead of shrinking the document. |

## Defect found and corrected during acceptance

The first long mixed-format run exposed an `html2canvas` incompatibility with CSS `color-mix()`. The capture-specific backgrounds were replaced with explicit colors. The complete long-format and settings matrix was then rerun successfully.

## Release gate

This report does not approve publication. Formal plugin publication remains paused until the user reviews the local result and explicitly asks to continue.

## v9 corrective acceptance

After reviewing a real exported document, v9 added a second acceptance cycle:

- Increased export body text to 22 px with 1.72 line height, code to 18 px, tables to 18 px, and the document title to 40 px.
- Kept each exchange heading, role label, and first content block together so a label cannot be orphaned above a large blank area.
- Split paragraphs containing rendered line breaks into individual pagination blocks without dropping content.
- Added an explicit full-screen control and kept the exchange selector before the final preview.
- Default state: latest complete exchange only — pass.
- Select All: 3 of 3 selected and seven A4 portrait pages generated — pass.
- Clear All and Latest Only — pass.
- Landscape 2-in-1: eight logical pages composed into four final sheets — pass.
- PDF and PNG completion messages confirmed both exporters consumed the final preview pages — pass.
- Mobile 390 × 844: selector visible, no horizontal overflow, and primary actions remained 44 px high — pass.
