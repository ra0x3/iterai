function readPrompt(): string {
  const textarea = document.querySelector(
    'textarea[aria-label="Message ChatGPT"]',
  ) as HTMLTextAreaElement | null;
  if (textarea && textarea.value.trim().length > 0) {
    return textarea.value.trim();
  }

  const editor = document.querySelector("div[contenteditable='true']");
  if (editor) {
    return editor.textContent?.trim() ?? "";
  }

  return "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "itera:get-page-prompt") {
    sendResponse({ prompt: readPrompt() });
    return true;
  }
  return false;
});
