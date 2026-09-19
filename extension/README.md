# pAIcture Companion

The companion is the structured browser fallback for public ChatGPT share pages. It opens the submitted public link in a background browser tab, waits for the rendered conversation, extracts the ordered message DOM, removes interactive controls and unsafe markup, and returns the normalized conversation to pAIcture.

## Install locally

1. Download paicture-companion.zip from pAIcture and extract it.
2. Open chrome://extensions or edge://extensions.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder.
5. Reload pAIcture and submit the public ChatGPT share link again.

The extension requests access only to ChatGPT public share pages and the pAIcture website. It does not read private chat history.
