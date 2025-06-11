document.addEventListener('DOMContentLoaded', () => {
  const captureBtn = document.getElementById('captureBtn');
  const captureAreaBtn = document.getElementById('captureAreaBtn');
  const screenshotCanvas = document.getElementById('screenshotCanvas');
  const ctx = screenshotCanvas.getContext('2d');
  const colorPicker = document.getElementById('colorPicker');
  const lineWidthInput = document.getElementById('lineWidth');
  const saveBtn = document.getElementById('saveBtn');
  const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');

  // Tool buttons
  const drawToolBtn = document.getElementById('drawToolBtn'); // New draw button
  const cropBtn = document.getElementById('cropBtn');
  const textToolBtn = document.getElementById('textToolBtn');
  const rectToolBtn = document.getElementById('rectToolBtn');
  const circleToolBtn = document.getElementById('circleToolBtn');

  // Tool-specific controls
  const applyCropBtn = document.getElementById('applyCropBtn');
  const textInput = document.getElementById('textInput');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const shapeFillCheckbox = document.getElementById('shapeFillCheckbox');

  // Group canvas interaction tool buttons for easier management of .active state
  const canvasToolBtns = [drawToolBtn, cropBtn, textToolBtn, rectToolBtn, circleToolBtn];

  let isDrawing, lastX, lastY, currentTool = 'draw', cropRect, isCropping, shapeStartCoords, isDrawingShape, originalImageSrc = null;

  function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function setActiveTool(toolName) {
    currentTool = toolName;
    isDrawing = isCropping = isDrawingShape = false; // Reset general drawing flags
    shapeStartCoords = cropRect = null; // Reset tool-specific data

    canvasToolBtns.forEach(btn => btn && btn.classList.remove('active')); // Clear active state from all

    const activeBtn = document.getElementById(toolName + "ToolBtn");
    if (activeBtn && canvasToolBtns.includes(activeBtn)) {
        activeBtn.classList.add('active');
    }

    // Manage visibility of controls based on the new tool
    applyCropBtn.style.display = 'none'; // Always hide applyCropBtn unless a crop is made
    if (toolName === 'crop' && originalImageSrc) {
        redrawOriginalImage(); // Clear any previous crop selection visuals
    }

    // Text tool controls
    const textControlElements = [textInput, fontSizeInput, document.querySelector('label[for="textInput"]'), document.querySelector('label[for="fontSizeInput"]')];
    textControlElements.forEach(el => el.style.display = (toolName === 'text') ? 'block' : 'none');

    // Shape tool controls (fill checkbox)
    const shapeFillControlGroup = shapeFillCheckbox.parentElement;
    if (shapeFillControlGroup) {
        shapeFillControlGroup.style.display = (toolName === 'rectangle' || toolName === 'circle') ? 'flex' : 'none';
    }

    // Common drawing attribute controls
    // Color picker: used by draw, text, shapes
    colorPicker.parentElement.style.display = ['draw', 'text', 'rectangle', 'circle'].includes(toolName) ? 'flex' : 'none';
    // Line width: used by draw, shapes
    lineWidthInput.parentElement.style.display = ['draw', 'rectangle', 'circle'].includes(toolName) ? 'flex' : 'none';

    console.log("Active tool:", currentTool);
  }

  function redrawOriginalImage(callback) {
    if (!originalImageSrc) {
      ctx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
      if (callback) callback(); return;
    }
    const img = new Image();
    img.onload = () => {
      screenshotCanvas.width = img.width; screenshotCanvas.height = img.height;
      ctx.clearRect(0, 0, img.width, img.height); ctx.drawImage(img, 0, 0);
      if (callback) callback();
    };
    img.onerror = () => { console.error("Err loading original img for redraw."); if (callback) callback(); };
    img.src = originalImageSrc;
  }

  // --- Capture Buttons ---
  captureBtn.addEventListener('click', () => { // Full page
    ctx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
    originalImageSrc = cropRect = null;
    setActiveTool('draw');
    chrome.runtime.sendMessage({ action: "capture" }, handleCaptureResponse);
  });

  captureAreaBtn.addEventListener('click', () => { // Selected area
    // Popup might close. No tool is "active" on the popup itself.
    chrome.runtime.sendMessage({ action: "initiateAreaCapture" });
  });

  // --- Message Handling from Background ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "areaCaptured") {
      if (message.dataUrl) {
        const image = new Image();
        image.onload = () => {
          screenshotCanvas.width = image.width; screenshotCanvas.height = image.height;
          ctx.drawImage(image, 0, 0);
          originalImageSrc = screenshotCanvas.toDataURL();
          setActiveTool('draw');
        };
        image.onerror = () => console.error("Error loading areaCaptured image data.");
        image.src = message.dataUrl;
      }
    } else if (message.action === "areaCaptureFailed") {
      console.error("Area capture failed:", message.error);
      alert("Could not capture selected area: " + message.error);
      setActiveTool('draw');
    }
    // Note: `sendResponse` is not used for these messages from background.
  });

  function handleCaptureResponse(response) { // For full page capture that uses sendResponse
      if (chrome.runtime.lastError) { console.error("Full page capture error:", chrome.runtime.lastError.message); return; }
      if (response && response.image_data_url) {
        const image = new Image();
        image.onload = () => {
          screenshotCanvas.width = image.width; screenshotCanvas.height = image.height;
          ctx.drawImage(image, 0, 0);
          originalImageSrc = screenshotCanvas.toDataURL();
          setActiveTool('draw');
        };
        image.onerror = () => console.error("Error loading image_data_url for canvas (full page).");
        image.src = response.image_data_url;
      } else if (response && response.error) {
          console.error("Full page capture failed (response.error):", response.error);
          alert("Full page capture failed: " + response.error);
      }
  }

  // --- Tool Button Event Listeners ---
  if (drawToolBtn) drawToolBtn.addEventListener('click', () => setActiveTool('draw'));
  if (cropBtn) cropBtn.addEventListener('click', () => setActiveTool('crop'));
  if (textToolBtn) textToolBtn.addEventListener('click', () => { setActiveTool('text'); if (textInput) textInput.focus(); });
  if (rectToolBtn) rectToolBtn.addEventListener('click', () => setActiveTool('rectangle'));
  if (circleToolBtn) circleToolBtn.addEventListener('click', () => setActiveTool('circle'));

  // --- Implicit Tool Setting via Controls (Optional: could be removed if explicit tool buttons are preferred) ---
  // colorPicker.addEventListener('input', () => { if(!['text','rectangle','circle','crop'].includes(currentTool)) setActiveTool('draw'); });
  // lineWidthInput.addEventListener('input', () => { if(!['rectangle','circle','crop', 'text'].includes(currentTool)) setActiveTool('draw'); });
  // Disabling these implicit switches for now, relying on explicit tool button clicks.

  // --- Action Buttons ---
  applyCropBtn.addEventListener('click', () => {
    if (cropRect && originalImageSrc) {
      const img = new Image();
      img.onload = () => {
        const cw = Math.abs(cropRect.endX - cropRect.startX); const ch = Math.abs(cropRect.endY - cropRect.startY);
        const csX = Math.min(cropRect.startX, cropRect.endX); const csY = Math.min(cropRect.startY, cropRect.endY);
        if (cw < 1 || ch < 1) { setActiveTool('draw'); return; } // Crop too small
        const tempC = document.createElement('canvas'); tempC.width = img.width; tempC.height = img.height;
        tempC.getContext('2d').drawImage(img, 0, 0);
        screenshotCanvas.width = cw; screenshotCanvas.height = ch;
        ctx.clearRect(0, 0, cw, ch); ctx.drawImage(tempC, csX, csY, cw, ch, 0, 0, cw, ch);
        originalImageSrc = screenshotCanvas.toDataURL(); setActiveTool('draw');
      };
      img.src = originalImageSrc;
    } else { setActiveTool('draw'); } // Fallback if something went wrong
  });

  // --- Canvas Event Handlers (Delegated by currentTool) ---
  screenshotCanvas.addEventListener('mousedown', (e) => {
    if (!originalImageSrc && currentTool !== 'text') { // Allow text on blank canvas only if sized.
         if (currentTool !== 'text' || (currentTool === 'text' && (screenshotCanvas.width === 0 || screenshotCanvas.height === 0))) {
            console.warn("No image on canvas to edit, or canvas not ready for text."); return;
         }
    }
    const pos = getMousePos(screenshotCanvas, e);

    if (currentTool === 'draw') {
      if (!originalImageSrc) return;
      isDrawing = true; [lastX, lastY] = [pos.x, pos.y];
      ctx.beginPath(); ctx.moveTo(lastX, lastY);
      ctx.strokeStyle = colorPicker.value; ctx.lineWidth = lineWidthInput.value;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    } else if (currentTool === 'crop') {
      if (!originalImageSrc) return;
      isCropping = true; cropRect = { startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y };
      applyCropBtn.style.display = 'none';
    } else if (currentTool === 'text') {
      const text = textInput.value.trim(); if (!text) { alert("Please enter text."); return; }
      const fontSize = fontSizeInput.value || "16";
      redrawOriginalImage(() => {
          ctx.font = `${fontSize}px sans-serif`; ctx.fillStyle = colorPicker.value;
          ctx.fillText(text, pos.x, pos.y);
          originalImageSrc = screenshotCanvas.toDataURL();
      });
    } else if (currentTool === 'rectangle' || currentTool === 'circle') {
      if (!originalImageSrc) return;
      isDrawingShape = true; shapeStartCoords = pos;
    }
  });

  screenshotCanvas.addEventListener('mousemove', (e) => {
    if (!originalImageSrc && currentTool !== 'text') return; // Generally no drawing if no image
    const pos = getMousePos(screenshotCanvas, e);

    if (currentTool === 'draw' && isDrawing) {
      ctx.lineTo(pos.x, pos.y); ctx.stroke(); [lastX, lastY] = [pos.x, pos.y];
    } else if (currentTool === 'crop' && isCropping && cropRect) {
      cropRect.endX = pos.x; cropRect.endY = pos.y;
      redrawOriginalImage(() => {
        ctx.strokeStyle='rgba(255,0,0,0.7)'; ctx.lineWidth=1; ctx.setLineDash([4,2]);
        ctx.strokeRect(cropRect.startX, cropRect.startY, cropRect.endX-cropRect.startX, cropRect.endY-cropRect.startY);
        ctx.setLineDash([]);
      });
    } else if ((currentTool === 'rectangle' || currentTool === 'circle') && isDrawingShape && shapeStartCoords) {
      redrawOriginalImage(() => { // Preview shape
        ctx.beginPath(); ctx.strokeStyle=colorPicker.value; ctx.lineWidth=lineWidthInput.value;
        const fill = shapeFillCheckbox.checked; if (fill) ctx.fillStyle=colorPicker.value;
        if (currentTool === 'rectangle') {
          ctx.rect(shapeStartCoords.x, shapeStartCoords.y, pos.x-shapeStartCoords.x, pos.y-shapeStartCoords.y);
        } else {
          const rX=Math.abs(pos.x-shapeStartCoords.x)/2; const rY=Math.abs(pos.y-shapeStartCoords.y)/2;
          const cX=Math.min(shapeStartCoords.x,pos.x)+rX; const cY=Math.min(shapeStartCoords.y,pos.y)+rY;
          ctx.ellipse(cX,cY,rX,rY,0,0,2*Math.PI);
        }
        if (fill) ctx.fill(); ctx.stroke();
      });
    }
  });

  screenshotCanvas.addEventListener('mouseup', (e) => {
    if (!originalImageSrc && currentTool !== 'text') return;
    const finalPos = getMousePos(screenshotCanvas, e);

    if (currentTool === 'draw' && isDrawing) {
      isDrawing=false; originalImageSrc=screenshotCanvas.toDataURL();
    } else if (currentTool === 'crop' && isCropping) {
      isCropping=false;
      if (cropRect && (Math.abs(cropRect.endX-cropRect.startX)>5 && Math.abs(cropRect.endY-cropRect.startY)>5)) {
        applyCropBtn.style.display='block';
      } else { cropRect=null; if(originalImageSrc) redrawOriginalImage(); } // Clear invalid crop rect
    } else if ((currentTool === 'rectangle' || currentTool === 'circle') && isDrawingShape && shapeStartCoords) {
      isDrawingShape=false;
      redrawOriginalImage(() => { // Draw final shape
        ctx.beginPath(); ctx.strokeStyle=colorPicker.value; ctx.lineWidth=lineWidthInput.value;
        const fill=shapeFillCheckbox.checked; if(fill)ctx.fillStyle=colorPicker.value;
        if (currentTool === 'rectangle') {
          ctx.rect(shapeStartCoords.x,shapeStartCoords.y,finalPos.x-shapeStartCoords.x,finalPos.y-shapeStartCoords.y);
        } else {
          const rX=Math.abs(finalPos.x-shapeStartCoords.x)/2; const rY=Math.abs(finalPos.y-shapeStartCoords.y)/2;
          const cX=Math.min(shapeStartCoords.x,finalPos.x)+rX; const cY=Math.min(shapeStartCoords.y,finalPos.y)+rY;
          ctx.ellipse(cX,cY,rX,rY,0,0,2*Math.PI);
        }
        if(fill)ctx.fill(); ctx.stroke();
        originalImageSrc=screenshotCanvas.toDataURL(); // Commit shape
      });
      shapeStartCoords=null;
    }
  });

  screenshotCanvas.addEventListener('mouseout', (e) => {
    // If drawing, finalize the current line segment.
    if (isDrawing) {
        isDrawing=false; if(originalImageSrc) originalImageSrc = screenshotCanvas.toDataURL();
    }
    // If cropping, and a valid crop was made, show apply. Otherwise, clear.
    else if (isCropping) {
        isCropping=false;
        if (cropRect && (Math.abs(cropRect.endX-cropRect.startX)>5 && Math.abs(cropRect.endY-cropRect.startY)>5)) {
            applyCropBtn.style.display='block';
        } else {
            cropRect=null; applyCropBtn.style.display='none';
            if(originalImageSrc) redrawOriginalImage(); // Clear invalid crop rect visual
        }
    }
    // If drawing a shape, cancel it (clear preview).
    else if (isDrawingShape) {
        isDrawingShape=false; shapeStartCoords=null;
        if(originalImageSrc) redrawOriginalImage();
        console.log("Shape drawing cancelled: mouse left canvas during draw.");
    }
  });

  // --- Output Buttons ---
  saveBtn.addEventListener('click', () => {
    if (!originalImageSrc && screenshotCanvas.width === 0) { alert("Canvas is empty. Nothing to save."); return; }
    redrawOriginalImage(() => {
        const dataURL = screenshotCanvas.toDataURL("image/png");
        chrome.downloads.download({url:dataURL,filename:"screenshot.png",saveAs:false},(id) => {
          if(chrome.runtime.lastError)console.error("Download error:",chrome.runtime.lastError.message);
          else if(!id)console.warn("Download did not start. Check permissions or browser logs.");
          else console.log("Image saved with download ID:",id);
        });
    });
  });

  copyToClipboardBtn.addEventListener('click', async () => {
    if (!originalImageSrc && screenshotCanvas.width === 0) { alert("No image to copy."); return; }
    redrawOriginalImage(async () => {
        try {
            screenshotCanvas.toBlob(async (blob) => {
                if (!blob) throw new Error("Canvas to Blob conversion failed.");
                await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
                const originalText = copyToClipboardBtn.textContent;
                copyToClipboardBtn.textContent = 'Copied!'; copyToClipboardBtn.disabled = true;
                setTimeout(() => { copyToClipboardBtn.textContent = originalText; copyToClipboardBtn.disabled = false; }, 2000);
            }, 'image/png');
        } catch (err) {
            console.error("Failed to copy image: ", err); alert("Error copying: " + err.message);
            copyToClipboardBtn.disabled = false;
        }
    });
  });

  // Initialize with the draw tool active.
  setActiveTool('draw');
});
