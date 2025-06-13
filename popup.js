document.addEventListener('DOMContentLoaded', () => {
  const captureBtn = document.getElementById('captureBtn');
  const captureAreaBtn = document.getElementById('captureAreaBtn');
  const screenshotCanvas = document.getElementById('screenshotCanvas');
  const ctx = screenshotCanvas.getContext('2d');
  const colorPicker = document.getElementById('colorPicker');
  const lineWidthInput = document.getElementById('lineWidth');
  const saveBtn = document.getElementById('saveBtn');
  const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');
  const openInEditorBtn = document.getElementById('openInEditorBtn'); // New button

  const drawToolBtn = document.getElementById('drawToolBtn');
  const cropBtn = document.getElementById('cropBtn');
  const textToolBtn = document.getElementById('textToolBtn');
  const textInput = document.getElementById('textInput');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const rectToolBtn = document.getElementById('rectToolBtn');
  const circleToolBtn = document.getElementById('circleToolBtn');
  const shapeFillCheckbox = document.getElementById('shapeFillCheckbox');
  const applyCropBtn = document.getElementById('applyCropBtn');

  const canvasToolBtns = [drawToolBtn, cropBtn, textToolBtn, rectToolBtn, circleToolBtn];
  let isDrawing, lastX, lastY, currentTool = 'draw', cropRect, isCropping, shapeStartCoords, isDrawingShape, originalImageSrc = null;

  function loadAndDisplayImage(dataUrl, fromAreaCapture = false) {
    const image = new Image();
    image.onload = () => {
      screenshotCanvas.width = image.width;
      screenshotCanvas.height = image.height;
      ctx.drawImage(image, 0, 0);
      originalImageSrc = screenshotCanvas.toDataURL();
      setActiveTool('draw');
      console.log(fromAreaCapture ? "Loaded area capture image." : "Loaded full page image.");
    };
    image.onerror = () => {
      console.error("Error loading image data:", fromAreaCapture ? "Area Capture" : "Full Page");
      alert("Failed to load captured image.");
      originalImageSrc = null;
      ctx.clearRect(0,0,screenshotCanvas.width, screenshotCanvas.height);
    };
    image.src = dataUrl;
  }

  function checkPendingCaptures() {
    chrome.storage.local.get(["pendingAreaCapture", "pendingAreaCaptureError"], (result) => {
      if (chrome.runtime.lastError) { console.error("Error getting from storage:", chrome.runtime.lastError); return; }
      if (result.pendingAreaCapture) {
        console.log("Found pending area capture in storage.");
        loadAndDisplayImage(result.pendingAreaCapture, true);
        chrome.storage.local.remove("pendingAreaCapture", () => console.log("Cleared pendingAreaCapture."));
      } else if (result.pendingAreaCaptureError) {
        console.error("Pending area capture error from storage:", result.pendingAreaCaptureError);
        alert("Previously failed to capture area: " + result.pendingAreaCaptureError);
        chrome.storage.local.remove("pendingAreaCaptureError", () => console.log("Cleared pendingAreaCaptureError."));
      }
    });
  }
  checkPendingCaptures();


  function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function setActiveTool(toolName) {
    currentTool = toolName;
    isDrawing = isCropping = isDrawingShape = false;
    shapeStartCoords = cropRect = null;

    canvasToolBtns.forEach(btn => btn && btn.classList.remove('active'));

    if (toolName !== 'captureArea') {
        const activeBtn = document.getElementById(toolName + "ToolBtn");
        if (activeBtn && canvasToolBtns.includes(activeBtn)) activeBtn.classList.add('active');
    }

    applyCropBtn.style.display = 'none';
    if (toolName === 'crop' && originalImageSrc) redrawOriginalImage();

    const textControls = [textInput, fontSizeInput, document.querySelector('label[for="textInput"]'), document.querySelector('label[for="fontSizeInput"]')];
    textControls.forEach(el => el.style.display = (toolName === 'text') ? 'block' : 'none');

    const shapeFillControlGroup = shapeFillCheckbox.parentElement;
    if (shapeFillControlGroup) shapeFillControlGroup.style.display = (toolName === 'rectangle' || toolName === 'circle') ? 'flex' : 'none';

    colorPicker.parentElement.style.display = ['draw', 'text', 'rectangle', 'circle'].includes(toolName) ? 'flex' : 'none';
    lineWidthInput.parentElement.style.display = ['draw', 'rectangle', 'circle'].includes(toolName) ? 'flex' : 'none';
    console.log("Popup Active tool:", currentTool);
  }

  function redrawOriginalImage(callback) {
    if (!originalImageSrc) {
      ctx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
      if (callback) callback(); return;
    }
    const img = new Image();
    img.onload = () => {
      if (screenshotCanvas.width !== img.width || screenshotCanvas.height !== img.height) {
        screenshotCanvas.width = img.width; screenshotCanvas.height = img.height;
      }
      ctx.clearRect(0, 0, img.width, img.height); ctx.drawImage(img, 0, 0);
      if (callback) callback();
    };
    img.onerror = () => { console.error("Popup: Err loading original img for redraw."); if (callback) callback(); };
    img.src = originalImageSrc;
  }

  captureBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
    originalImageSrc = cropRect = null;
    setActiveTool('draw');
    chrome.runtime.sendMessage({ action: "capture" }, handleCaptureResponse);
  });

  captureAreaBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "initiateAreaCapture" });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "areaCaptured") {
      console.log("Popup received areaCaptured (fromStorage:", message.fromStorage,")");
      if (message.dataUrl) {
          loadAndDisplayImage(message.dataUrl, true);
      }
    } else if (message.action === "areaCaptureFailed") {
      console.error("Popup received areaCaptureFailed:", message.error, "(fromStorage:", message.fromStorage, ")");
      alert("Could not capture selected area: " + message.error);
      setActiveTool('draw');
      if (message.fromStorage === false || message.fromStorage === undefined) {
          chrome.storage.local.remove("pendingAreaCaptureError", () => console.log("Popup cleared pendingAreaCaptureError after direct fail msg."));
      }
    }
  });

  function handleCaptureResponse(response) {
      if (chrome.runtime.lastError) { console.error("Full page capture error:", chrome.runtime.lastError.message); return; }
      if (response && response.image_data_url) {
        loadAndDisplayImage(response.image_data_url, false);
      } else if (response && response.error) {
          console.error("Full page capture failed (response.error):", response.error);
          alert("Full page capture failed: " + response.error);
      }
  }

  if (drawToolBtn) drawToolBtn.addEventListener('click', () => setActiveTool('draw'));
  if (cropBtn) cropBtn.addEventListener('click', () => setActiveTool('crop'));
  if (textToolBtn) textToolBtn.addEventListener('click', () => { setActiveTool('text'); if (textInput) textInput.focus(); });
  if (rectToolBtn) rectToolBtn.addEventListener('click', () => setActiveTool('rectangle'));
  if (circleToolBtn) circleToolBtn.addEventListener('click', () => setActiveTool('circle'));

  applyCropBtn.addEventListener('click', () => { /* ... (logic is identical, no changes needed for this subtask) ... */
    if (cropRect && originalImageSrc) {
      const img = new Image();
      img.onload = () => {
        const cw = Math.abs(cropRect.endX - cropRect.startX); const ch = Math.abs(cropRect.endY - cropRect.startY);
        const csX = Math.min(cropRect.startX, cropRect.endX); const csY = Math.min(cropRect.startY, cropRect.endY);
        if (cw < 1 || ch < 1) { setActiveTool('draw'); return; }
        const tempC = document.createElement('canvas'); tempC.width = img.width; tempC.height = img.height;
        tempC.getContext('2d').drawImage(img, 0, 0);
        screenshotCanvas.width = cw; screenshotCanvas.height = ch;
        ctx.clearRect(0, 0, cw, ch); ctx.drawImage(tempC, csX, csY, cw, ch, 0, 0, cw, ch);
        originalImageSrc = screenshotCanvas.toDataURL(); setActiveTool('draw');
      };
      img.src = originalImageSrc;
    } else { setActiveTool('draw'); }
  });

  screenshotCanvas.addEventListener('mousedown', (e) => { /* ... (logic is identical, no changes needed) ... */
    if (!originalImageSrc && currentTool !== 'text') {
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
      const textVal = textInput.value.trim(); if (!textVal) { alert("Please enter text."); return; }
      const fontSize = fontSizeInput.value || "16";
      redrawOriginalImage(() => {
          ctx.font = `${fontSize}px sans-serif`; ctx.fillStyle = colorPicker.value;
          ctx.fillText(textVal, pos.x, pos.y); // Use textVal here
          originalImageSrc = screenshotCanvas.toDataURL();
      });
    } else if (currentTool === 'rectangle' || currentTool === 'circle') {
      if (!originalImageSrc) return;
      isDrawingShape = true; shapeStartCoords = pos;
    }
  });

  screenshotCanvas.addEventListener('mousemove', (e) => { /* ... (logic is identical, no changes needed) ... */
    if (!originalImageSrc && currentTool !== 'text') return;
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
      redrawOriginalImage(() => {
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

  screenshotCanvas.addEventListener('mouseup', (e) => { /* ... (logic is identical, no changes needed) ... */
    if (!originalImageSrc && currentTool !== 'text') return;
    const finalPos = getMousePos(screenshotCanvas, e);
    if (currentTool === 'draw' && isDrawing) {
      isDrawing=false; originalImageSrc=screenshotCanvas.toDataURL();
    } else if (currentTool === 'crop' && isCropping) {
      isCropping=false;
      if (cropRect && (Math.abs(cropRect.endX-cropRect.startX)>5 && Math.abs(cropRect.endY-cropRect.startY)>5)) {
        applyCropBtn.style.display='block';
      } else { cropRect=null; if(originalImageSrc) redrawOriginalImage(); }
    } else if ((currentTool === 'rectangle' || currentTool === 'circle') && isDrawingShape && shapeStartCoords) {
      isDrawingShape=false;
      redrawOriginalImage(() => {
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
        originalImageSrc=screenshotCanvas.toDataURL();
      });
      shapeStartCoords=null;
    }
  });

  screenshotCanvas.addEventListener('mouseout', (e) => { /* ... (logic is identical, no changes needed) ... */
    if (isDrawing) { isDrawing=false; if(originalImageSrc) originalImageSrc = screenshotCanvas.toDataURL(); }
    else if (isCropping) { isCropping=false;
      if (cropRect && (Math.abs(cropRect.endX-cropRect.startX)>5 && Math.abs(cropRect.endY-cropRect.startY)>5)) {
        applyCropBtn.style.display='block';
      } else { cropRect=null; applyCropBtn.style.display='none'; if(originalImageSrc) redrawOriginalImage(); }
    } else if (isDrawingShape) { isDrawingShape=false; shapeStartCoords=null; if(originalImageSrc) redrawOriginalImage(); }
  });

  saveBtn.addEventListener('click', () => { /* ... (logic is identical, no changes needed) ... */
    if (!originalImageSrc && screenshotCanvas.width === 0) { alert("Canvas is empty."); return; }
    redrawOriginalImage(() => {
        const dataURL = screenshotCanvas.toDataURL("image/png");
        chrome.downloads.download({url:dataURL,filename:"screenshot.png",saveAs:false},(id) => {
          if(chrome.runtime.lastError)console.error("Download error:",chrome.runtime.lastError.message);
          else if(!id)console.warn("Download did not start."); else console.log("Image saved, ID:",id);
        });
    });
  });

  copyToClipboardBtn.addEventListener('click', async () => { /* ... (logic is identical, no changes needed) ... */
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

  // --- Open in Editor Button ---
  if(openInEditorBtn) {
    openInEditorBtn.addEventListener('click', () => {
        if (!originalImageSrc && screenshotCanvas.width === 0) {
            alert("No image to open in editor. Capture an image first.");
            return;
        }
        // Ensure the canvas is up-to-date with originalImageSrc before getting its data URL
        redrawOriginalImage(() => {
            const currentImageDataUrl = screenshotCanvas.toDataURL();
            chrome.storage.local.set({ imageToEditInEditor: currentImageDataUrl }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error setting image to storage for editor:", chrome.runtime.lastError);
                    alert("Could not prepare image for editor. Please try again.");
                    return;
                }
                chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
                window.close(); // Close the popup after opening the editor tab
            });
        });
    });
  }

  setActiveTool('draw');
});
