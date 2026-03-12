chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "activate") {
    console.log("Flash Yank activated");
  }
});
