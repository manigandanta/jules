console.log("Background script loaded.");

// Example: Listen for the extension being installed
chrome.runtime.onInstalled.addListener(() => {
  console.log("Chrome extension installed.");
});
