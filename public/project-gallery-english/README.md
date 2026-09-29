# pAIcture English export gallery

These images are deterministic captures of pAIcture's real conversation-document renderer. The sample conversation is fully in English and covers editorial text, code, tables, dark appearance, generated-image presentation, and alternative page geometry.

1. `01-english-document-header.png` — document header and first Q&A
2. `02-english-editorial-answer.png` — long-form editorial answer
3. `03-english-code-and-table.png` — code block and comparison table
4. `04-english-generated-image.png` — generated-image presentation
5. `05-english-dark-document.png` — dark document appearance
6. `06-english-dark-technical.png` — dark technical content
7. `07-english-landscape-layout.png` — landscape page geometry
8. `08-english-a3-layout.png` — A3 page geometry

Regenerate with:

```powershell
node scripts/generate-editorial-export-fixture.mjs
node scripts/generate-english-gallery.mjs
```
