console.log("Background script loaded.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture") { // Existing full page capture
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error("Capture error:", chrome.runtime.lastError.message);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ image_data_url: dataUrl });
      }
    });
    return true;
  } else if (request.action === "initiateAreaCapture") {
    // This message comes from popup.js
    // We need the tab ID to inject the content script.
    // The sender object for a message from a popup doesn't directly include sender.tab.id
    // for the *active* tab. We need to query for it.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const activeTabId = tabs[0].id;
        // Check if the URL is a restricted one before trying to inject.
        if (tabs[0].url && (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('https://chrome.google.com/webstore'))) {
            console.warn(`Cannot inject script into restricted URL: ${tabs[0].url}`);
            // Optionally send a message back to popup indicating failure
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: "Cannot capture selected area on this page due to restrictions." });
            return;
        }

        chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          files: ["content_script.js"]
        }, (injectionResults) => {
          if (chrome.runtime.lastError) {
            console.error("Error injecting content script:", chrome.runtime.lastError.message);
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: chrome.runtime.lastError.message });
          } else if (!injectionResults || injectionResults.length === 0 || !injectionResults[0].result) {
            // This case might happen if the content script couldn't execute, e.g. due to page's CSP
            // console.warn("Content script injection result was empty or unsuccessful, or script itself had an error.");
            // chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: "Failed to execute selection script on the page." });
          } else {
            console.log("Content script for area capture injected successfully.");
          }
        });
      } else {
        console.error("No active tab found to inject content script.");
        chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: "No active tab found." });
      }
    });
    // No sendResponse needed here as this is initiating an action, not returning data directly
    return false; // Not using sendResponse asynchronously from this specific handler path
  } else if (request.action === "captureAreaCoords") {
    // This message comes from content_script.js
    const { x, y, width, height, devicePixelRatio } = request.coords;

    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error("Failed to capture visible tab for area crop:", chrome.runtime.lastError.message);
        // Inform popup if possible, though it might be closed.
        chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: chrome.runtime.lastError.message });
        return; // No sendResponse as this is an async error in a callback
      }
      if (!dataUrl) {
        console.error("captureVisibleTab returned empty dataUrl.");
        chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: "Capture returned no data." });
        return;
      }

      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        // Adjust coordinates and dimensions by devicePixelRatio
        const sx = x * devicePixelRatio;
        const sy = y * devicePixelRatio;
        const sWidth = width * devicePixelRatio;
        const sHeight = height * devicePixelRatio;

        tempCanvas.width = sWidth;
        tempCanvas.height = sHeight;

        // Ensure source image dimensions are sufficient before drawing
        if (img.width < sx + sWidth || img.height < sy + sHeight) {
            console.error("Error: Crop area is outside the bounds of the captured image.",
                          {imgW: img.width, imgH: img.height, sx, sy, sWidth, sHeight});
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: "Selected area was outside the captured image bounds." });
            return;
        }

        tempCtx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        try {
            const croppedDataUrl = tempCanvas.toDataURL('image/png');
            // Send this back to the extension's runtime (popup.js will listen)
            chrome.runtime.sendMessage({ action: "areaCaptured", dataUrl: croppedDataUrl });
        } catch (e) {
            console.error("Error converting canvas to Data URL:", e);
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: "Could not process captured area." });
        }
      };
      img.onerror = () => {
        console.error("Failed to load captured image for processing.");
        chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: "Failed to load captured image." });
      };
      img.src = dataUrl;
    });
    // sendResponse is not used here because the response is sent via a new chrome.runtime.sendMessage
    return false; // Not using sendResponse from this handler
  }
  // Return true for handlers that will use sendResponse asynchronously.
  // For "initiateAreaCapture" and "captureAreaCoords", they don't use sendResponse directly to the caller of *this specific message*,
  // but rather initiate new messages or actions.
  // The original "capture" action *does* use sendResponse.
  return request.action === "capture";
});
