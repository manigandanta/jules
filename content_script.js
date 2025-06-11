(() => {
  if (window.hasRunAreaSelector) {
    return; // Script already injected and running/ran
  }
  window.hasRunAreaSelector = true;

  const overlay = document.createElement('div');
  overlay.id = 'screenshot-tool-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
  overlay.style.cursor = 'crosshair';
  overlay.style.zIndex = '2147483647'; // Max z-index
  document.body.appendChild(overlay);

  let startX, startY, selectionRect;
  let isSelecting = false;

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;

    selectionRect = document.createElement('div');
    selectionRect.id = 'screenshot-tool-selection';
    selectionRect.style.position = 'fixed';
    selectionRect.style.border = '2px dashed #fff';
    selectionRect.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    selectionRect.style.left = startX + 'px';
    selectionRect.style.top = startY + 'px';
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    selectionRect.style.zIndex = '2147483647'; // Ensure it's on top of overlay
    overlay.appendChild(selectionRect); // Append to overlay for coordinate simplicity
  }, true);

  overlay.addEventListener('mousemove', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSelecting || !selectionRect) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const newX = Math.min(startX, currentX);
    const newY = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionRect.style.left = newX + 'px';
    selectionRect.style.top = newY + 'px';
    selectionRect.style.width = width + 'px';
    selectionRect.style.height = height + 'px';
  }, true);

  overlay.addEventListener('mouseup', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSelecting || !selectionRect) {
        cleanup();
        return;
    }
    isSelecting = false;

    const rectX = parseFloat(selectionRect.style.left);
    const rectY = parseFloat(selectionRect.style.top);
    const rectWidth = parseFloat(selectionRect.style.width);
    const rectHeight = parseFloat(selectionRect.style.height);

    // Ensure minimum size for capture
    if (rectWidth < 10 || rectHeight < 10) {
        console.log("Selected area too small, cancelling.");
        cleanup();
        return;
    }

    const coords = {
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: rectHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      // Also pass scroll offsets if capturing document relative, not viewport relative.
      // For captureVisibleTab, viewport relative is fine.
      // scrollX: window.scrollX, // Not needed for captureVisibleTab with viewport coords
      // scrollY: window.scrollY  // Not needed
    };

    chrome.runtime.sendMessage({ action: "captureAreaCoords", coords: coords })
      .catch(error => console.error("Error sending coords message:", error));

    cleanup();
  }, true);

  function cleanup() {
    if (selectionRect && selectionRect.parentNode) {
      selectionRect.parentNode.removeChild(selectionRect);
    }
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    window.hasRunAreaSelector = false; // Allow re-injection if needed
  }

  // Optional: Listen for Escape key to cancel
  document.addEventListener('keydown', function escKeyListener(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      document.removeEventListener('keydown', escKeyListener, true);
    }
  }, true);

})();
