document.addEventListener('DOMContentLoaded', () => {
  const captureBtn = document.getElementById('captureBtn');
  const screenshotCanvas = document.getElementById('screenshotCanvas');
  const ctx = screenshotCanvas.getContext('2d');
  const colorPicker = document.getElementById('colorPicker');
  const lineWidthInput = document.getElementById('lineWidth');
  const saveBtn = document.getElementById('saveBtn'); // Get reference to saveBtn

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  // Helper function to get mouse position relative to canvas
  function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
    };
  }

  captureBtn.addEventListener('click', () => {
    // Clear canvas before capturing new screenshot
    ctx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
    chrome.runtime.sendMessage({ action: "capture" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Capture error:", chrome.runtime.lastError.message);
        return;
      }
      if (response && response.image_data_url) {
        const image = new Image();
        image.onload = () => {
          screenshotCanvas.width = image.width;
          screenshotCanvas.height = image.height;
          ctx.drawImage(image, 0, 0);
        };
        image.onerror = () => {
          console.error("Error loading image for canvas.");
        };
        image.src = response.image_data_url;
      } else if (response && response.error) {
        console.error("Capture failed:", response.error);
      }
    });
  });

  screenshotCanvas.addEventListener('mousedown', (e) => {
    if (screenshotCanvas.width === 0 || screenshotCanvas.height === 0) return; // Don't draw if canvas is empty
    isDrawing = true;
    const pos = getMousePos(screenshotCanvas, e);
    [lastX, lastY] = [pos.x, pos.y];
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.strokeStyle = colorPicker.value;
    ctx.lineWidth = lineWidthInput.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  });

  screenshotCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const pos = getMousePos(screenshotCanvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    [lastX, lastY] = [pos.x, pos.y];
  });

  screenshotCanvas.addEventListener('mouseup', () => {
    if (isDrawing) {
      ctx.stroke();
      isDrawing = false;
    }
  });

  screenshotCanvas.addEventListener('mouseout', () => {
    if (isDrawing) {
      ctx.stroke();
      isDrawing = false;
    }
  });

  // Event listener for saveBtn
  saveBtn.addEventListener('click', () => {
    if (screenshotCanvas.width === 0 || screenshotCanvas.height === 0) {
      console.warn("Canvas is empty. Nothing to save.");
      alert("Canvas is empty. Capture a screenshot first."); // Inform user
      return;
    }
    const dataURL = screenshotCanvas.toDataURL("image/png");
    chrome.downloads.download({
      url: dataURL,
      filename: "screenshot.png",
      saveAs: false // Set to true to prompt user for filename/location
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Download error:", chrome.runtime.lastError.message);
        // Potentially inform the user about the error, e.g., via an alert
        // alert("Failed to save image: " + chrome.runtime.lastError.message);
      } else if (downloadId === undefined && chrome.runtime.lastError === undefined) {
        // This case can happen if the download is initiated but no ID is returned,
        // and there's no explicit error. It might indicate an issue with permissions
        // or an internal browser decision not to proceed with the download.
        console.warn("Download did not start. Check extension permissions and browser settings.");
        // alert("Download did not start. Please check extension permissions.");
      } else {
        console.log("Image saved with download ID:", downloadId);
      }
    });
  });
});
