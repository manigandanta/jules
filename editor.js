document.addEventListener('DOMContentLoaded', () => {
    const editorCanvas = document.getElementById('editorCanvas');
    const ctx = editorCanvas.getContext('2d');
    const noImageMessage = document.getElementById('noImageMessage');

    // --- Element References from popup.js (ensure IDs match in editor.html) ---
    const colorPicker = document.getElementById('colorPicker');
    const lineWidthInput = document.getElementById('lineWidth');
    const saveBtn = document.getElementById('saveBtn');
    const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');

    const drawToolBtn = document.getElementById('drawToolBtn');
    const cropBtn = document.getElementById('cropBtn');
    const applyCropBtn = document.getElementById('applyCropBtn');
    const textToolBtn = document.getElementById('textToolBtn');
    const textInput = document.getElementById('textInput');
    const fontSizeInput = document.getElementById('fontSizeInput');
    const rectToolBtn = document.getElementById('rectToolBtn');
    const circleToolBtn = document.getElementById('circleToolBtn');
    const shapeFillCheckbox = document.getElementById('shapeFillCheckbox');

    const canvasToolBtns = [drawToolBtn, cropBtn, textToolBtn, rectToolBtn, circleToolBtn];

    // --- State Variables (mirrored from popup.js, but specific to editor) ---
    let isDrawing, lastX, lastY, currentTool = 'draw', cropRect, isCropping, shapeStartCoords, isDrawingShape;
    let editorOriginalImageSrc = null; // Primary image data for the editor

    // --- Load Image from Storage ---
    function loadInitialImage() {
        chrome.storage.local.get("imageToEditInEditor", (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting image from storage:", chrome.runtime.lastError);
                noImageMessage.textContent = "Error loading image. Please try again.";
                noImageMessage.style.display = "block";
                return;
            }
            if (result.imageToEditInEditor) {
                const dataUrl = result.imageToEditInEditor;
                const image = new Image();
                image.onload = () => {
                    editorCanvas.width = image.width;
                    editorCanvas.height = image.height;
                    ctx.drawImage(image, 0, 0);
                    editorOriginalImageSrc = editorCanvas.toDataURL(); // Use canvas data after drawing
                    noImageMessage.style.display = "none";
                    setActiveTool('draw'); // Set default tool after image loads
                };
                image.onerror = () => {
                    console.error("Failed to load imageToEditInEditor from data URL.");
                    noImageMessage.textContent = "Could not load the image data.";
                    noImageMessage.style.display = "block";
                };
                image.src = dataUrl;
                chrome.storage.local.remove("imageToEditInEditor", () => {
                    console.log("Cleared imageToEditInEditor from storage.");
                });
            } else {
                noImageMessage.style.display = "block";
                // Disable editing controls if no image? Or allow drawing on blank canvas?
                // For now, most tools check for editorOriginalImageSrc.
            }
        });
    }
    loadInitialImage();

    // --- Helper Functions (Ported and adapted from popup.js) ---
    function getMousePos(canvas, evt) {
        const rect = canvas.getBoundingClientRect();
        // Consider canvas scaling if its display size is different from its resolution
        return {
            x: (evt.clientX - rect.left) * (canvas.width / rect.width),
            y: (evt.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function setActiveTool(toolName) {
        currentTool = toolName;
        isDrawing = isCropping = isDrawingShape = false;
        shapeStartCoords = cropRect = null;

        canvasToolBtns.forEach(btn => btn && btn.classList.remove('active'));

        const activeBtn = document.getElementById(toolName + "ToolBtn");
        if (activeBtn && canvasToolBtns.includes(activeBtn)) {
            activeBtn.classList.add('active');
        }

        applyCropBtn.style.display = 'none';
        if (toolName === 'crop' && editorOriginalImageSrc) {
            redrawOriginalImage();
        }

        // Controls visibility based on current tool
        const textToolControls = document.querySelectorAll('.text-tool-control');
        textToolControls.forEach(el => el.style.display = (toolName === 'text') ? 'flex' : 'none');

        const shapeToolControls = document.querySelectorAll('.shape-tool-control');
        shapeToolControls.forEach(el => el.style.display = (toolName === 'rectangle' || toolName === 'circle') ? 'flex' : 'none');

        colorPicker.parentElement.style.display = ['draw', 'text', 'rectangle', 'circle'].includes(toolName) ? 'flex' : 'none';
        lineWidthInput.parentElement.style.display = ['draw', 'rectangle', 'circle'].includes(toolName) ? 'flex' : 'none';
        console.log("Editor Active tool:", currentTool);
    }

    function redrawOriginalImage(callback) {
        if (!editorOriginalImageSrc) {
            ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height); // Clear if no base image
            if (callback) callback();
            return;
        }
        const img = new Image();
        img.onload = () => {
            // Ensure canvas is sized to the image being redrawn if it's different
            if (editorCanvas.width !== img.width || editorCanvas.height !== img.height) {
                 editorCanvas.width = img.width; editorCanvas.height = img.height;
            }
            ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
            ctx.drawImage(img, 0, 0);
            if (callback) callback();
        };
        img.onerror = () => { console.error("Editor: Error loading original image for redraw."); if (callback) callback(); };
        img.src = editorOriginalImageSrc;
    }

    // --- Tool Button Event Listeners ---
    if (drawToolBtn) drawToolBtn.addEventListener('click', () => setActiveTool('draw'));
    if (cropBtn) cropBtn.addEventListener('click', () => setActiveTool('crop'));
    if (textToolBtn) textToolBtn.addEventListener('click', () => { setActiveTool('text'); if (textInput) textInput.focus(); });
    if (rectToolBtn) rectToolBtn.addEventListener('click', () => setActiveTool('rectangle'));
    if (circleToolBtn) circleToolBtn.addEventListener('click', () => setActiveTool('circle'));

    // --- Action Buttons (Apply Crop) ---
    applyCropBtn.addEventListener('click', () => {
        if (cropRect && editorOriginalImageSrc) {
            const img = new Image();
            img.onload = () => {
                const cw = Math.abs(cropRect.endX - cropRect.startX);
                const ch = Math.abs(cropRect.endY - cropRect.startY);
                const csX = Math.min(cropRect.startX, cropRect.endX);
                const csY = Math.min(cropRect.startY, cropRect.endY);

                if (cw < 1 || ch < 1) { setActiveTool('draw'); return; }

                const tempC = document.createElement('canvas'); tempC.width = img.width; tempC.height = img.height;
                tempC.getContext('2d').drawImage(img, 0, 0); // Draw current editorOriginalImageSrc to temp canvas

                editorCanvas.width = cw; editorCanvas.height = ch; // Resize main canvas
                ctx.clearRect(0, 0, cw, ch);
                ctx.drawImage(tempC, csX, csY, cw, ch, 0, 0, cw, ch); // Draw cropped part
                editorOriginalImageSrc = editorCanvas.toDataURL(); // Update base image
                setActiveTool('draw');
            };
            img.src = editorOriginalImageSrc; // Use the current base image for cropping
        } else {
            setActiveTool('draw');
        }
    });

    // --- Canvas Event Handlers (Ported and adapted) ---
    editorCanvas.addEventListener('mousedown', (e) => {
        if (!editorOriginalImageSrc && currentTool !== 'text' && currentTool !== 'draw') { // Allow draw/text on blank canvas
             if (currentTool !== 'text' && currentTool !== 'draw' || ((currentTool === 'text' || currentTool === 'draw') && (editorCanvas.width === 0 || editorCanvas.height === 0)) ) {
                 console.warn("No image loaded or canvas not ready."); return;
             }
        }
        const pos = getMousePos(editorCanvas, e);

        if (currentTool === 'draw') {
            isDrawing = true; [lastX, lastY] = [pos.x, pos.y];
            ctx.beginPath(); ctx.moveTo(lastX, lastY);
            ctx.strokeStyle = colorPicker.value; ctx.lineWidth = lineWidthInput.value;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        } else if (currentTool === 'crop') {
            if (!editorOriginalImageSrc) return;
            isCropping = true; cropRect = { startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y };
            applyCropBtn.style.display = 'none';
        } else if (currentTool === 'text') {
            const text = textInput.value.trim(); if (!text) { alert("Please enter text."); return; }
            const fontSize = fontSizeInput.value || "16";
            // Redraw necessary if text is added to existing image, not strictly if on blank
            if (editorOriginalImageSrc) redrawOriginalImage(() => drawText(text, pos.x, pos.y, fontSize, colorPicker.value));
            else drawText(text, pos.x, pos.y, fontSize, colorPicker.value); // Draw on blank canvas

        } else if (currentTool === 'rectangle' || currentTool === 'circle') {
            if (!editorOriginalImageSrc && (editorCanvas.width === 0 || editorCanvas.height === 0)) return; // Need a canvas to draw on
            isDrawingShape = true; shapeStartCoords = pos;
        }
    });

    function drawText(text, x, y, fontSize, color) {
        ctx.font = `${fontSize}px sans-serif`; ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        editorOriginalImageSrc = editorCanvas.toDataURL(); // Update base image
    }

    editorCanvas.addEventListener('mousemove', (e) => {
        // Allow preview even if editorOriginalImageSrc is null for draw/shape tools on a blank canvas
        const pos = getMousePos(editorCanvas, e);

        if (currentTool === 'draw' && isDrawing) {
            ctx.lineTo(pos.x, pos.y); ctx.stroke(); [lastX, lastY] = [pos.x, pos.y];
        } else if (currentTool === 'crop' && isCropping && cropRect) {
            if (!editorOriginalImageSrc) return; // Crop only makes sense on an image
            cropRect.endX = pos.x; cropRect.endY = pos.y;
            redrawOriginalImage(() => {
                ctx.strokeStyle='rgba(255,0,0,0.7)'; ctx.lineWidth=1; ctx.setLineDash([4,2]);
                ctx.strokeRect(cropRect.startX, cropRect.startY, cropRect.endX-cropRect.startX, cropRect.endY-cropRect.startY);
                ctx.setLineDash([]);
            });
        } else if ((currentTool === 'rectangle' || currentTool === 'circle') && isDrawingShape && shapeStartCoords) {
            const drawCurrentShapePreview = () => {
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
            };
            if (editorOriginalImageSrc) redrawOriginalImage(drawCurrentShapePreview);
            else { // Drawing shape on blank canvas
                ctx.clearRect(0,0, editorCanvas.width, editorCanvas.height); // Clear for preview
                drawCurrentShapePreview();
            }
        }
    });

    editorCanvas.addEventListener('mouseup', (e) => {
        const finalPos = getMousePos(editorCanvas, e);
        if (currentTool === 'draw' && isDrawing) {
            isDrawing=false; editorOriginalImageSrc=editorCanvas.toDataURL(); // Commit draw
        } else if (currentTool === 'crop' && isCropping) {
            isCropping=false; if (!editorOriginalImageSrc) return;
            if (cropRect && (Math.abs(cropRect.endX-cropRect.startX)>5 && Math.abs(cropRect.endY-cropRect.startY)>5)) {
                applyCropBtn.style.display='block';
            } else { cropRect=null; redrawOriginalImage(); }
        } else if ((currentTool === 'rectangle' || currentTool === 'circle') && isDrawingShape && shapeStartCoords) {
            isDrawingShape=false;
            const drawFinalShape = () => {
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
                editorOriginalImageSrc=editorCanvas.toDataURL(); // Commit shape
            };
            if (editorOriginalImageSrc) redrawOriginalImage(drawFinalShape);
            else { // Final shape on blank canvas
                 ctx.clearRect(0,0, editorCanvas.width, editorCanvas.height); // Clear preview
                 drawFinalShape();
            }
            shapeStartCoords=null;
        }
    });

    editorCanvas.addEventListener('mouseout', (e) => {
        if (isDrawing) { isDrawing=false; editorOriginalImageSrc = editorCanvas.toDataURL(); }
        else if (isCropping) { isCropping=false; /* Crop selection persists until new tool or apply */ }
        else if (isDrawingShape) {
            isDrawingShape=false; shapeStartCoords=null;
            if(editorOriginalImageSrc) redrawOriginalImage(); // Clear preview
            else ctx.clearRect(0,0, editorCanvas.width, editorCanvas.height);
        }
    });

    // --- Output Functions (Ported) ---
    saveBtn.addEventListener('click', () => {
        if (!editorOriginalImageSrc && editorCanvas.width === 0) { alert("Canvas is empty."); return; }
        // Ensure canvas has the latest from editorOriginalImageSrc if no previews are active
        redrawOriginalImage(() => {
            const dataURL = editorCanvas.toDataURL("image/png");
            chrome.downloads.download({url:dataURL,filename:"edited-screenshot.png",saveAs:true},(id) => {
              if(chrome.runtime.lastError)console.error("Save error:",chrome.runtime.lastError.message);
              else if(!id)console.warn("Download not started."); else console.log("Image saved:",id);
            });
        });
    });

    copyToClipboardBtn.addEventListener('click', async () => {
        if (!editorOriginalImageSrc && editorCanvas.width === 0) { alert("No image to copy."); return; }
        redrawOriginalImage(async () => {
            try {
                editorCanvas.toBlob(async (blob) => {
                    if (!blob) throw new Error("Blob creation failed.");
                    await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
                    const originalText = copyToClipboardBtn.textContent;
                    copyToClipboardBtn.textContent = 'Copied!'; copyToClipboardBtn.disabled = true;
                    setTimeout(() => { copyToClipboardBtn.textContent = originalText; copyToClipboardBtn.disabled = false; }, 2000);
                }, 'image/png');
            } catch (err) {
                console.error("Copy to clipboard error: ", err); alert("Copy error: " + err.message);
                copyToClipboardBtn.disabled = false;
            }
        });
    });

    // Set initial tool (draw tool is default)
    setActiveTool('draw');
});
