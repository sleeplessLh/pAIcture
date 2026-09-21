# pAIcture Companion

The companion imports a single ChatGPT conversation through the user's existing signed-in browser session. It extracts ordered and sanitized message HTML, validates the extracted count against the rendered turn count, and returns only the normalized conversation to pAIcture. Cookies and account credentials never leave the browser.

There are two supported flows:

- Open a ChatGPT conversation and click the pAIcture toolbar icon. The companion extracts the current page, stores a one-time transfer locally, and opens pAIcture with the preview.
- Paste a ChatGPT conversation URL into pAIcture. The site verifies that Companion is connected before enabling import, then asks it to open and extract that URL.

## Install locally

1. Download paicture-companion.zip from pAIcture and extract it.
2. Open chrome://extensions or edge://extensions.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder.
5. Sign in to ChatGPT in the same browser.
6. Reload pAIcture and submit either a private `/c/…` conversation URL or a public `/share/…` URL.

For the shortest workflow, pin the extension in the browser toolbar, open a ChatGPT conversation, and click **Export this conversation with pAIcture**.

The extension requests access to ChatGPT pages so it can open the exact conversation URL submitted by the user. It does not enumerate chat history and does not transmit session cookies.
