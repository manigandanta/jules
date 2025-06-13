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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const activeTabId = tabs[0].id;
        const activeTabUrl = tabs[0].url;

        if (activeTabUrl && (activeTabUrl.startsWith('chrome://') || activeTabUrl.startsWith('https://chrome.google.com/webstore'))) {
          const errorMsg = "Cannot capture selected area on this page due to restrictions.";
          console.warn(`Attempted to inject script into restricted URL: ${activeTabUrl}`);
          chrome.storage.local.set({ pendingAreaCaptureError: errorMsg }, () => {
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: errorMsg, fromStorage: true });
          });
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          files: ["content_script.js"]
        }, (injectionResults) => {
          if (chrome.runtime.lastError) {
            const errorMsg = `Error injecting content script: ${chrome.runtime.lastError.message}`;
            console.error(errorMsg);
            chrome.storage.local.set({ pendingAreaCaptureError: errorMsg }, () => {
              chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: errorMsg, fromStorage: true });
            });
          } else if (!injectionResults || injectionResults.length === 0) {
             // This case means the content script was injected but did not return a result (e.g., it threw an error itself before sending a message)
             // No specific error from chrome.scripting, but the script might not have run as expected.
             // content_script.js itself will send a message if it fails before selection (e.g. min size)
             console.log("Content script for area capture injected, awaiting user selection or script error.");
          } else {
            console.log("Content script for area capture injected successfully.");
          }
        });
      } else {
        const errorMsg = "No active tab found to inject content script.";
        console.error(errorMsg);
        chrome.storage.local.set({ pendingAreaCaptureError: errorMsg }, () => {
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: errorMsg, fromStorage: true });
        });
      }
    });
    return false;
  } else if (request.action === "captureAreaCoords") {
    const { x, y, width, height, devicePixelRatio } = request.coords;

    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        const errorMsg = `Failed to capture visible tab for area crop: ${chrome.runtime.lastError.message}`;
        console.error(errorMsg);
        chrome.storage.local.set({ pendingAreaCaptureError: errorMsg }, () => {
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: errorMsg, fromStorage: true });
        });
        return;
      }
      if (!dataUrl) {
        const errorMsg = "CaptureVisibleTab returned empty dataUrl.";
        console.error(errorMsg);
        chrome.storage.local.set({ pendingAreaCaptureError: errorMsg }, () => {
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: errorMsg, fromStorage: true });
        });
        return;
      }

      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        const sx = x * devicePixelRatio; const sy = y * devicePixelRatio;
        const sWidth = width * devicePixelRatio; const sHeight = height * devicePixelRatio;

        tempCanvas.width = sWidth; tempCanvas.height = sHeight;

        if (img.width < sx + sWidth || img.height < sy + sHeight) {
            const errorMsg = "Selected area was outside the captured image bounds.";
            console.error(errorMsg, {imgW: img.width, imgH: img.height, sx, sy, sWidth, sHeight});
            chrome.storage.local.set({ pendingAreaCaptureError: errorMsg }, () => {
                chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: errorMsg, fromStorage: true });
            });
            return;
        }

        tempCtx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        try {
            const croppedDataUrl = tempCanvas.toDataURL('image/png');
            chrome.storage.local.set({ pendingAreaCapture: croppedDataUrl }, () => {
                console.log("Cropped area capture saved to storage.");
                // Attempt to send direct message to popup as an optimization
                chrome.runtime.sendMessage({ action: "areaCaptured", dataUrl: croppedDataUrl, fromStorage: false });
                // Note: We don't remove from storage here. Popup will do it after loading.
            });
        } catch (e) {
            const errorMsg = `Could not process captured area (toDataURL failed): ${e.message}`;
            console.error(errorMsg);
            chrome.storage.local.set({ pendingAreaCaptureError: errorMsg }, () => {
                chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: errorMsg, fromStorage: true });
            });
        }
      };
      img.onerror = () => {
        const errorMsg = "Failed to load captured image for processing (img.onerror).";
        console.error(errorMsg);
        chrome.storage.local.set({ pendingAreaCaptureError: errorMsg }, () => {
            chrome.runtime.sendMessage({ action: "areaCaptureFailed", error: errorMsg, fromStorage: true });
        });
      };
      img.src = dataUrl;
    });
    return false;
  }
  return request.action === "capture"; // Only "capture" uses sendResponse directly and needs to return true.
});
