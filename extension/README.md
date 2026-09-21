# pAIcture Companion

The companion imports a single ChatGPT conversation that the user explicitly submits to pAIcture. It opens that URL in the user's existing signed-in browser session, waits for every rendered turn, extracts ordered and sanitized message HTML, and returns only the normalized conversation to pAIcture. Cookies and account credentials never leave the browser.

## Install locally

1. Download paicture-companion.zip from pAIcture and extract it.
2. Open chrome://extensions or edge://extensions.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder.
5. Sign in to ChatGPT in the same browser.
6. Reload pAIcture and submit either a private `/c/…` conversation URL or a public `/share/…` URL.

The extension requests access to ChatGPT pages so it can open the exact conversation URL submitted by the user. It does not enumerate chat history and does not transmit session cookies.
