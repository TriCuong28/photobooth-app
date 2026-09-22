/**
 * K-PHOTOBOOTH STUDIO ENGINE (8-SHOT CAPTURE & PHOTO SELECTION VERSION 4.0)
 * Automated 8-Shot Capture, Interactive Photo Selection Step, Canvas Compositing & Export
 */

document.addEventListener('DOMContentLoaded', () => {

    // Device Session Privacy Isolation (Anonymous Unique Device ID)
    let deviceSessionId = localStorage.getItem('photobooth_device_session_id');
    if (!deviceSessionId) {
        deviceSessionId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('photobooth_device_session_id', deviceSessionId);
    }

    // ==========================================================================
    // 1. STATE MANAGEMENT
    // ==========================================================================
    const state = {
        stream: null,
        selectedCameraId: '',
        countdownTime: 5,
        totalShots: 8, // Always capture 8 shots
        requiredShots: 4, // 4 for strip/grid2x2, 6 for grid3x2
        layoutType: 'strip', // 'strip', 'grid2x2', 'grid3x2'
        frameStyle: 'classic', // 'classic', 'korean', 'film', 'y2k', 'polaroid'
        capturedImages: [],
        selectedPhotoIndices: [], // Indices of selected photos out of 8
        chosenImages: [], // Final images selected for canvas composition
        currentShotIndex: 0,
        isCapturing: false,
        isMirrored: true, // Auto-detected based on front vs rear camera
        userManualMirror: null, // null for auto, boolean for manual override

        // Editor State
        activeFilter: 'normal',
        generatedGifDataUrl: null,
        frameBgColor: '#ffffff',
        framePadding: 20,
        frameTitle: 'K-PHOTOBOOTH MEMORY',
        frameDate: new Date().toLocaleDateString('vi-VN'),
        textColor: '#111111',

        // Interactive Stickers Array
        stickers: [],
        selectedStickerId: null
    };

    // ==========================================================================
    // 2. DOM ELEMENTS REGISTRY
    // ==========================================================================
    const elements = {
        // Screens
        screenWelcome: document.getElementById('screen-welcome'),
        screenCapture: document.getElementById('screen-capture'),
        screenSelectPhotos: document.getElementById('screen-select-photos'),
        screenEdit: document.getElementById('screen-edit'),
        screenResult: document.getElementById('screen-result'),

        // Header & Server Status
        serverStatus: document.getElementById('server-status'),
        serverStatusText: document.getElementById('server-status-text'),
        headerGalleryBtn: document.getElementById('header-gallery-btn'),
        fullscreenBtn: document.getElementById('fullscreen-btn'),

        // Welcome Controls
        cameraSelect: document.getElementById('camera-select'),
        timerBtns: document.querySelectorAll('.timer-btn'),
        layoutCards: document.querySelectorAll('.layout-card'),
        startBtn: document.getElementById('start-btn'),
        openGalleryBtn: document.getElementById('open-gallery-btn'),

        // Capture Controls
        webcam: document.getElementById('webcam'),
        toggleMirrorBtn: document.getElementById('toggle-mirror-btn'),
        flashOverlay: document.getElementById('flash-overlay'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        countdownNumber: document.getElementById('countdown-number'),
        quickSnapBtn: document.getElementById('quick-snap-btn'),
        quickSnapBarBtn: document.getElementById('quick-snap-bar-btn'),
        shotCounterText: document.getElementById('shot-counter-text'),
        poseHintText: document.getElementById('pose-hint-text'),
        thumbnailsList: document.getElementById('thumbnails-list'),
        cancelCaptureBtn: document.getElementById('cancel-capture-btn'),
        backHomeBtn: document.getElementById('back-home-btn'),
        downloadGifBtn: document.getElementById('download-gif-btn'),

        // Selection Screen Controls
        selectionGrid: document.getElementById('selection-grid'),
        selectionFramePreview: document.getElementById('selection-frame-preview'),
        selectionMiniCanvas: document.getElementById('selection-mini-canvas'),
        selectionCounterText: document.getElementById('selection-counter-text'),
        reTakePhotosBtn: document.getElementById('re-take-photos-btn'),
        confirmPhotoSelectionBtn: document.getElementById('confirm-photo-selection-btn'),

        // Editor Controls
        photoboothCanvas: document.getElementById('photobooth-canvas'),
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        framePresetCards: document.querySelectorAll('.frame-preset-card'),
        frameStyleBtns: document.querySelectorAll('.frame-style-btn'),
        colorDots: document.querySelectorAll('.color-dot'),
        customColorPicker: document.getElementById('custom-frame-color'),
        gradientDots: document.querySelectorAll('.gradient-dot'),
        textColorDots: document.querySelectorAll('.text-color-dot'),
        filterCards: document.querySelectorAll('.filter-card'),
        paddingSlider: document.getElementById('frame-padding-slider'),
        frameTitleInput: document.getElementById('frame-title-input'),
        frameDateInput: document.getElementById('frame-date-input'),

        // Stickers Controls
        stickerItems: document.querySelectorAll('.sticker-item'),
        customEmojiInput: document.getElementById('custom-emoji-input'),
        addCustomEmojiBtn: document.getElementById('add-custom-emoji-btn'),
        stickerScaleSlider: document.getElementById('sticker-scale-slider'),
        stickerRotateSlider: document.getElementById('sticker-rotate-slider'),
        deleteSelectedStickerBtn: document.getElementById('delete-selected-sticker-btn'),
        clearStickersBtn: document.getElementById('clear-stickers-btn'),

        retakeAllBtn: document.getElementById('retake-all-btn'),
        finishEditBtn: document.getElementById('finish-edit-btn'),

        // Result & Export Controls
        finalImagePreview: document.getElementById('final-image-preview'),
        printableImage: document.getElementById('printable-image'),
        qrcodeCanvas: document.getElementById('qrcode-canvas'),
        uploadStatusNotice: document.getElementById('upload-status-notice'),
        downloadBtn: document.getElementById('download-btn'),
        printBtn: document.getElementById('print-btn'),
        newSessionBtn: document.getElementById('new-session-btn'),

        // Gallery Modal
        galleryModal: document.getElementById('gallery-modal'),
        closeGalleryBtn: document.getElementById('close-gallery-btn'),
        galleryGrid: document.getElementById('gallery-grid'),
        gallerySelectAllCb: document.getElementById('gallery-select-all-cb'),
        galleryTotalCount: document.getElementById('gallery-total-count'),
        gallerySelectedCount: document.getElementById('gallery-selected-count'),
        galleryDeleteSelectedCount: document.getElementById('gallery-delete-selected-count'),
        deleteSelectedGalleryBtn: document.getElementById('delete-selected-gallery-btn'),
        deleteAllGalleryBtn: document.getElementById('delete-all-gallery-btn')
    };

    // Initialize Default Values
    elements.frameDateInput.value = state.frameDate;

    // ==========================================================================
    // 3. SOUND SYNTHESIZER (SAFE WEB AUDIO API)
    // ==========================================================================
    let audioCtx = null;
    function getAudioContext() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
        return audioCtx;
    }

    function playSound(type) {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
            const now = ctx.currentTime;

            if (type === 'beep') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.15);

            } else if (type === 'shutter') {
                const bufferSize = ctx.sampleRate * 0.1;
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const output = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
                const whiteNoise = ctx.createBufferSource();
                whiteNoise.buffer = buffer;
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 1000;
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
                whiteNoise.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                whiteNoise.start(now);

            } else if (type === 'pop') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.08);
            }
        } catch (err) {}
    }

    // ==========================================================================
    // 4. SCREEN SWITCHER & BACKEND API CONNECTIVITY
    // ==========================================================================
    function switchScreen(targetScreen) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        targetScreen.classList.add('active');
    }

    async function checkServerStatus() {
        try {
            const res = await fetch('/api/info');
            if (res.ok) {
                const data = await res.json();
                if (elements.serverStatus) {
                    elements.serverStatus.className = 'server-badge online';
                    elements.serverStatusText.textContent = `Server LAN: ${data.serverIp}:${data.port}`;
                }
                return;
            }
        } catch (e) {}
        if (elements.serverStatus) {
            elements.serverStatus.className = 'server-badge offline';
            elements.serverStatusText.textContent = 'Server Offline (Local fallback)';
        }
    }
    checkServerStatus();

    // ==========================================================================
    // 5. CAMERA ENGINE & DEVICE ENUMERATION
    // ==========================================================================
    async function initCameraDevices() {
        if (!elements.cameraSelect) return;
        
        elements.cameraSelect.innerHTML = `
            <option value="default">📷 Camera Web Default</option>
            <option value="virtual">📷 Camera Studio Mô Phỏng (Virtual)</option>
        `;

        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            if (videoDevices.length > 0) {
                elements.cameraSelect.innerHTML = videoDevices.map((d, i) => {
                    const labelLower = (d.label || '').toLowerCase();
                    const isRear = labelLower.includes('back') || labelLower.includes('rear') || labelLower.includes('environment') || labelLower.includes('sau');
                    const icon = isRear ? '📷 Camera Sau' : '🤳 Camera Trước';
                    return `
                        <option value="${d.deviceId}" ${d.deviceId === state.selectedCameraId ? 'selected' : ''}>
                            ${icon}: ${d.label || `Camera ${i + 1}`}
                        </option>
                    `;
                }).join('') + '<option value="virtual">📷 Camera Studio Mô Phỏng (Virtual)</option>';

                if (!state.selectedCameraId) {
                    state.selectedCameraId = videoDevices[0].deviceId;
                }
            }
        } catch (e) {}
    }

    function updateMirrorMode() {
        let isBackCamera = false;
        if (state.stream) {
            const track = state.stream.getVideoTracks()[0];
            if (track) {
                const settings = (track.getSettings && track.getSettings()) || {};
                const label = (track.label || '').toLowerCase();
                if (settings.facingMode === 'environment' || label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('sau')) {
                    isBackCamera = true;
                } else if (settings.facingMode === 'user' || label.includes('front') || label.includes('selfie') || label.includes('truedepth') || label.includes('trước')) {
                    isBackCamera = false;
                }
            }
        }

        if (state.userManualMirror !== null) {
            state.isMirrored = state.userManualMirror;
        } else {
            state.isMirrored = !isBackCamera; // Front camera -> Mirrored (true), Rear camera -> Unmirrored (false)
        }

        if (elements.webcam) {
            if (state.isMirrored) {
                elements.webcam.classList.add('mirror-mode');
            } else {
                elements.webcam.classList.remove('mirror-mode');
            }
        }

        const mirrorBtnText = document.getElementById('mirror-btn-text');
        if (mirrorBtnText) {
            mirrorBtnText.textContent = state.isMirrored ? 'Lật Gương: Bật 🪞' : 'Lật Gương: Tắt 📷';
        }
    }

    async function startWebcamStream() {
        if (state.stream) {
            try { state.stream.getTracks().forEach(track => track.stop()); } catch (e) {}
            state.stream = null;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            await initCameraDevices();
            updateMirrorMode();
            return;
        }

        let videoConstraints = true;
        if (state.selectedCameraId && state.selectedCameraId !== 'virtual' && state.selectedCameraId !== 'default') {
            videoConstraints = { deviceId: { exact: state.selectedCameraId } };
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: false
            });

            state.stream = stream;
            if (elements.webcam) {
                elements.webcam.srcObject = stream;
                await elements.webcam.play().catch(() => {});
            }
            await initCameraDevices();
            updateMirrorMode();

        } catch (err) {
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                state.stream = fallbackStream;
                if (elements.webcam) {
                    elements.webcam.srcObject = fallbackStream;
                    await elements.webcam.play().catch(() => {});
                }
                await initCameraDevices();
                updateMirrorMode();
            } catch (e) {
                if (elements.cameraSelect) {
                    elements.cameraSelect.innerHTML = '<option value="virtual">📷 Camera Studio Mô Phỏng (Virtual)</option>';
                }
                updateMirrorMode();
            }
        }
    }

    initCameraDevices();
    startWebcamStream();

    elements.cameraSelect.addEventListener('change', (e) => {
        state.selectedCameraId = e.target.value;
        state.userManualMirror = null; // reset to auto-detect on camera switch
        startWebcamStream();
    });

    if (elements.toggleMirrorBtn) {
        elements.toggleMirrorBtn.addEventListener('click', () => {
            state.userManualMirror = !state.isMirrored;
            updateMirrorMode();
            playSound('pop');
        });
    }

    // ==========================================================================
    // 6. WELCOME SETUP & LAYOUT SELECTION
    // ==========================================================================
    elements.timerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.timerBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.countdownTime = parseInt(btn.dataset.time, 10);
            playSound('pop');
        });
    });

    elements.layoutCards.forEach(card => {
        card.addEventListener('click', () => {
            elements.layoutCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.layoutType = card.dataset.layout;
            const shots = parseInt(card.dataset.shots, 10);
            state.requiredShots = shots;
            playSound('pop');
        });
    });

    function getSlotAspectRatio(layoutType = state.layoutType) {
        const pad = state.framePadding || 20;
        let canvasW = 1800, canvasH = 2400, footerH = 220;

        if (layoutType === 'strip') {
            canvasW = 1000; canvasH = 3000; footerH = 280;
            const availableHeight = canvasH - (pad * 5) - footerH;
            const photoH = availableHeight / 4;
            const photoW = canvasW - (pad * 2);
            return photoW / photoH;

        } else if (layoutType === 'grid2x2') {
            canvasW = 1800; canvasH = 2400; footerH = 220;
            const photoW = (canvasW - (pad * 3)) / 2;
            const photoH = (canvasH - (pad * 3) - footerH) / 2;
            return photoW / photoH;

        } else { // grid3x2
            canvasW = 1800; canvasH = 2600; footerH = 200;
            const photoW = (canvasW - (pad * 3)) / 2;
            const photoH = (canvasH - (pad * 4) - footerH) / 3;
            return photoW / photoH;
        }
    }

    function updateCameraViewfinderRatio() {
        const ratio = getSlotAspectRatio(state.layoutType);
        const container = document.querySelector('.viewfinder-container');
        if (container) {
            container.style.aspectRatio = `${ratio}`;
        }
    }

    elements.startBtn.addEventListener('click', () => {
        state.capturedImages = [];
        state.selectedPhotoIndices = [];
        state.chosenImages = [];
        state.currentShotIndex = 0;
        state.isCapturing = true;
        updateCameraViewfinderRatio();
        renderThumbnailsSidebar();
        switchScreen(elements.screenCapture);

        if (elements.webcam && state.stream) {
            elements.webcam.play().catch(() => {});
        }

        runCaptureLoop();
    });

    // ==========================================================================
    // 7. CAPTURE LOOP (CAPTURE 8 SHOTS)
    // ==========================================================================
    const poseHints = [
        "Thủ thế 1/8! Thả tim K-pop 🫰",
        "Thủ thế 2/8! Cool ngầu nha 🔥",
        "Thủ thế 3/8! Cười tươi hết cỡ 😁",
        "Thủ thế 4/8! Nháy mắt đáng yêu 😜",
        "Thủ thế 5/8! Chu mỏ cute 💋",
        "Thủ thế 6/8! Tạo dáng tự do ✌️",
        "Thủ thế 7/8! Đeo kính chất ngầu 🕶️",
        "Thủ thế 8/8! Dáng chốt ấn tượng 👑"
    ];

    async function runCaptureLoop() {
        for (let i = 0; i < state.totalShots; i++) {
            if (!state.isCapturing) break;

            state.currentShotIndex = i;
            elements.shotCounterText.textContent = `${i + 1}/${state.totalShots}`;
            elements.poseHintText.textContent = poseHints[i % poseHints.length];

            await runCountdown(state.countdownTime);

            if (!state.isCapturing) break;

            triggerCameraFlash();
            const photoDataUrl = captureVideoFrame(i);
            if (photoDataUrl) {
                state.capturedImages.push(photoDataUrl);
                renderThumbnailsSidebar();
            }

            await new Promise(r => setTimeout(r, 1200));
        }

        if (state.isCapturing && state.capturedImages.length > 0) {
            state.isCapturing = false;
            // Switch to Photo Selection Screen
            switchScreen(elements.screenSelectPhotos);
            renderPhotoSelectionGrid();
        }
    }

    let currentCountdownTimer = null;
    let currentCountdownResolver = null;

    function runCountdown(seconds) {
        return new Promise(resolve => {
            let count = seconds;
            currentCountdownResolver = resolve;
            elements.countdownOverlay.classList.remove('hidden');
            elements.countdownOverlay.style.display = 'flex';
            elements.countdownNumber.textContent = count;
            playSound('beep');

            currentCountdownTimer = setInterval(() => {
                count--;
                if (count > 0) {
                    elements.countdownNumber.textContent = count;
                    playSound('beep');
                } else {
                    finishCountdown();
                }
            }, 1000);

            function finishCountdown() {
                if (currentCountdownTimer) {
                    clearInterval(currentCountdownTimer);
                    currentCountdownTimer = null;
                }
                elements.countdownOverlay.classList.add('hidden');
                elements.countdownOverlay.style.display = 'none';
                currentCountdownResolver = null;
                resolve();
            }
        });
    }

    function triggerQuickSnap() {
        if (currentCountdownTimer || currentCountdownResolver) {
            if (currentCountdownTimer) {
                clearInterval(currentCountdownTimer);
                currentCountdownTimer = null;
            }
            if (elements.countdownOverlay) {
                elements.countdownOverlay.classList.add('hidden');
                elements.countdownOverlay.style.display = 'none';
            }
            if (currentCountdownResolver) {
                const resolve = currentCountdownResolver;
                currentCountdownResolver = null;
                resolve();
            }
        } else if (!state.isCapturing) {
            startCaptureSession();
        }
    }

    function triggerCameraFlash() {
        if (!elements.flashOverlay) return;
        elements.flashOverlay.classList.add('active');
        playSound('shutter');
        setTimeout(() => {
            elements.flashOverlay.classList.remove('active');
        }, 200);
    }

    function captureVideoFrame(shotIndex = 0) {
        const targetVideo = elements.webcam;
        if (targetVideo && targetVideo.readyState >= 2 && targetVideo.videoWidth > 0 && targetVideo.videoHeight > 0) {
            const targetRatio = getSlotAspectRatio(state.layoutType);
            const videoW = targetVideo.videoWidth;
            const videoH = targetVideo.videoHeight;
            const videoRatio = videoW / videoH;

            let cropW = videoW;
            let cropH = videoH;
            let cropX = 0;
            let cropY = 0;

            if (videoRatio > targetRatio) {
                cropW = videoH * targetRatio;
                cropX = (videoW - cropW) / 2;
            } else {
                cropH = videoW / targetRatio;
                cropY = (videoH - cropH) / 2;
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(cropW);
            canvas.height = Math.round(cropH);
            const ctx = canvas.getContext('2d');

            if (state.isMirrored) {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }

            ctx.drawImage(targetVideo, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

            return canvas.toDataURL('image/png');
        }

        return generateVirtualStudioPoseImage(shotIndex);
    }

    function generateVirtualStudioPoseImage(shotIndex) {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 960;
        const ctx = canvas.getContext('2d');

        const gradients = [
            ['#ff9a9e', '#fecfef'],
            ['#a1c4fd', '#c2e9fb'],
            ['#fbc2eb', '#a6c1ee'],
            ['#84fab0', '#8fd3f4'],
            ['#f6d365', '#fda085'],
            ['#ffecd2', '#fcb69f'],
            ['#a8c0ff', '#3f2b96'],
            ['#f83600', '#f9d423']
        ];
        const colors = gradients[shotIndex % gradients.length];
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - 40, 260, 0, Math.PI * 2);
        ctx.fill();

        const emojis = ['📸', '✌️', '💖', '👑', '😎', '🐱', '🎀', '🌟'];
        ctx.font = '160px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emojis[shotIndex % emojis.length], canvas.width / 2, canvas.height / 2 - 50);

        ctx.fillStyle = '#111111';
        ctx.font = 'bold 44px Outfit, sans-serif';
        ctx.fillText(`K-STUDIO POSE #${shotIndex + 1}`, canvas.width / 2, canvas.height / 2 + 150);

        ctx.fillStyle = '#444444';
        ctx.font = '500 28px Outfit, sans-serif';
        ctx.fillText('✨ Photobooth Memory Capture ✨', canvas.width / 2, canvas.height / 2 + 200);

        return canvas.toDataURL('image/png');
    }

    // Clean Styled Sidebar Thumbnails Rendering
    function renderThumbnailsSidebar() {
        if (!elements.thumbnailsList) return;
        elements.thumbnailsList.innerHTML = '';
        for (let i = 0; i < state.totalShots; i++) {
            const slot = document.createElement('div');
            slot.className = 'thumb-slot';
            if (i === state.currentShotIndex && state.isCapturing && !state.capturedImages[i]) {
                slot.classList.add('active-shot');
            }
            if (state.capturedImages[i]) {
                slot.classList.add('filled');
                slot.innerHTML = `<img src="${state.capturedImages[i]}" alt="Shot ${i + 1}">`;
            } else {
                slot.innerHTML = `<span>${i + 1}</span>`;
            }
            elements.thumbnailsList.appendChild(slot);
        }
    }



    function abortCurrentCaptureSession() {
        state.isCapturing = false;
        if (currentCountdownTimer) {
            clearInterval(currentCountdownTimer);
            currentCountdownTimer = null;
        }
        if (currentCountdownResolver) {
            const resolve = currentCountdownResolver;
            currentCountdownResolver = null;
            resolve(); // Unblock async promise so runCaptureLoop terminates cleanly
        }
        if (elements.countdownOverlay) {
            elements.countdownOverlay.classList.add('hidden');
            elements.countdownOverlay.style.display = 'none';
        }
    }

    async function resetAndRestartCapture() {
        abortCurrentCaptureSession();

        // Give a short tick for previous capture loop to exit
        await new Promise(r => setTimeout(r, 150));

        // Reset all photo captures state
        state.capturedImages = [];
        state.selectedPhotoIndices = [];
        state.chosenImages = [];
        state.currentShotIndex = 0;
        state.isCapturing = true;

        renderThumbnailsSidebar();

        if (elements.webcam && state.stream) {
            elements.webcam.play().catch(() => {});
        }

        // Restart capture sequence from Shot 1/8!
        runCaptureLoop();
    }

    if (elements.cancelCaptureBtn) {
        elements.cancelCaptureBtn.addEventListener('click', () => {
            playSound('pop');
            resetAndRestartCapture();
        });
    }

    if (elements.backHomeBtn) {
        elements.backHomeBtn.addEventListener('click', () => {
            playSound('pop');
            abortCurrentCaptureSession();
            state.capturedImages = [];
            state.selectedPhotoIndices = [];
            state.chosenImages = [];
            state.currentShotIndex = 0;
            switchScreen(elements.screenWelcome);
        });
    }

    if (elements.quickSnapBtn) {
        elements.quickSnapBtn.addEventListener('click', () => {
            playSound('pop');
            triggerQuickSnap();
        });
    }

    if (elements.quickSnapBarBtn) {
        elements.quickSnapBarBtn.addEventListener('click', () => {
            playSound('pop');
            triggerQuickSnap();
        });
    }

    // ==========================================================================
    // 8. INTERACTIVE PHOTO SELECTION SCREEN (SCREEN 2.5)
    // ==========================================================================
    function renderPhotoSelectionGrid() {
        if (!elements.selectionGrid) return;
        elements.selectionGrid.innerHTML = '';
        state.selectedPhotoIndices = []; // User selects their favorite photos manually from 8 shots!

        updateSelectionCounterUI();
        renderSelectionSlotsPreview();

        state.capturedImages.forEach((imgSrc, idx) => {
            const card = document.createElement('div');
            card.className = 'select-photo-card';
            card.dataset.index = idx;

            const selectedOrderIndex = state.selectedPhotoIndices.indexOf(idx);
            if (selectedOrderIndex !== -1) {
                card.classList.add('selected');
            }

            card.innerHTML = `
                <img src="${imgSrc}" alt="Shot ${idx + 1}">
                <div class="select-order-badge">${selectedOrderIndex !== -1 ? (selectedOrderIndex + 1) : '<i class="fa-solid fa-plus"></i>'}</div>
            `;

            card.addEventListener('click', () => {
                togglePhotoSelection(idx);
            });

            elements.selectionGrid.appendChild(card);
        });
    }

    function togglePhotoSelection(photoIdx) {
        const existingPos = state.selectedPhotoIndices.indexOf(photoIdx);

        if (existingPos !== -1) {
            // Unselect
            state.selectedPhotoIndices.splice(existingPos, 1);
            playSound('pop');
        } else {
            // Select if limit not reached
            if (state.selectedPhotoIndices.length < state.requiredShots) {
                state.selectedPhotoIndices.push(photoIdx);
                playSound('pop');
            } else {
                alert(`Bạn đã chọn đủ ${state.requiredShots} bức ảnh! Hãy bấm vào ảnh đã chọn để thay đổi nếu muốn.`);
            }
        }

        updateSelectionCardsGridUI();
        updateSelectionCounterUI();
        renderSelectionSlotsPreview();
    }

    function renderSelectionSlotsPreview() {
        const targetCanvas = elements.selectionMiniCanvas;
        if (!targetCanvas) return;

        const currentPhotosList = [];
        for (let i = 0; i < state.requiredShots; i++) {
            const photoIdx = state.selectedPhotoIndices[i];
            if (photoIdx !== undefined && state.capturedImages[photoIdx]) {
                currentPhotosList.push(state.capturedImages[photoIdx]);
            } else {
                currentPhotosList.push(null);
            }
        }

        renderPhotoboothCanvasToTarget(targetCanvas, currentPhotosList);
    }

    if (elements.selectionMiniCanvas) {
        elements.selectionMiniCanvas.addEventListener('click', () => {
            const dataUrl = elements.selectionMiniCanvas.toDataURL('image/png');
            if (!dataUrl) return;

            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.style.zIndex = '9999';
            modal.innerHTML = `
                <div class="modal-container glass-card" style="max-width: 600px; padding: 20px; text-align: center;">
                    <div class="modal-header" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="font-size: 16px;"><i class="fa-solid fa-magnifying-glass-plus"></i> Phóng To Khung Xem Trước</h3>
                        <button class="close-btn" style="background: none; border: none; color: #fff; font-size: 24px; cursor: pointer;">&times;</button>
                    </div>
                    <img src="${dataUrl}" style="max-width: 100%; max-height: 75vh; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); object-fit: contain;">
                </div>
            `;
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
            document.body.appendChild(modal);
        });
    }

    function updateSelectionCardsGridUI() {
        const cards = elements.selectionGrid.querySelectorAll('.select-photo-card');
        cards.forEach(card => {
            const idx = parseInt(card.dataset.index, 10);
            const pos = state.selectedPhotoIndices.indexOf(idx);
            const badge = card.querySelector('.select-order-badge');

            if (pos !== -1) {
                card.classList.add('selected');
                if (badge) badge.textContent = pos + 1;
            } else {
                card.classList.remove('selected');
                if (badge) badge.innerHTML = '<i class="fa-solid fa-plus"></i>';
            }
        });
    }

    function updateSelectionCounterUI() {
        const currentCount = state.selectedPhotoIndices.length;
        if (elements.selectionCounterText) {
            elements.selectionCounterText.textContent = `Đã chọn ${currentCount} / ${state.requiredShots} tấm`;
        }

        if (elements.confirmPhotoSelectionBtn) {
            elements.confirmPhotoSelectionBtn.disabled = (currentCount !== state.requiredShots);
        }
    }

    elements.reTakePhotosBtn.addEventListener('click', () => {
        state.capturedImages = [];
        state.selectedPhotoIndices = [];
        state.chosenImages = [];
        state.currentShotIndex = 0;
        state.isCapturing = true;
        renderThumbnailsSidebar();
        switchScreen(elements.screenCapture);
        runCaptureLoop();
    });

    elements.confirmPhotoSelectionBtn.addEventListener('click', () => {
        if (state.selectedPhotoIndices.length !== state.requiredShots) return;

        // Build chosenImages array in exact selected order
        state.chosenImages = state.selectedPhotoIndices.map(idx => state.capturedImages[idx]);
        switchScreen(elements.screenEdit);
        renderPhotoboothCanvas();
    });

    // ==========================================================================
    // 9. CANVAS EDITOR RENDER ENGINE & FRAME STYLES
    // ==========================================================================
    function loadImage(src) {
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    function applyCanvasBackground(ctx, width, height, bgVal) {
        if (!bgVal) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            return;
        }

        if (bgVal.includes('linear-gradient') || bgVal.includes(',') || bgVal.startsWith('#')) {
            const colorMatches = bgVal.match(/#(?:[0-9a-fA-F]{3,8})|rgb\([^)]+\)/g);
            if (colorMatches && colorMatches.length >= 2) {
                const grad = ctx.createLinearGradient(0, 0, width, height);
                colorMatches.forEach((col, idx) => {
                    const stop = idx / (colorMatches.length - 1);
                    grad.addColorStop(stop, col);
                });
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, width, height);
                return;
            }
        }

        ctx.fillStyle = bgVal;
        ctx.fillRect(0, 0, width, height);
    }

    function renderPhotoboothCanvas() {
        return renderPhotoboothCanvasToTarget(elements.photoboothCanvas, null);
    }

    async function renderPhotoboothCanvasToTarget(targetCanvas, customPhotosList = null) {
        if (!targetCanvas) return;
        const ctx = targetCanvas.getContext('2d');
        const pad = state.framePadding;

        if (state.layoutType === 'strip') {
            targetCanvas.width = 1000;
            targetCanvas.height = 3000;
        } else if (state.layoutType === 'grid2x2') {
            targetCanvas.width = 1800;
            targetCanvas.height = 2400;
        } else { // grid3x2
            targetCanvas.width = 1800;
            targetCanvas.height = 2600;
        }

        const sideFilmMargin = (state.frameStyle === 'film') ? 80 : 0;
        const availableWidth = targetCanvas.width - (sideFilmMargin * 2);

        // Apply background
        if (state.frameStyle === 'film') {
            applyCanvasBackground(ctx, targetCanvas.width, targetCanvas.height, '#0a0a0d');
        } else {
            applyCanvasBackground(ctx, targetCanvas.width, targetCanvas.height, state.frameBgColor);
        }

        const renderList = customPhotosList || (state.chosenImages.length > 0 ? state.chosenImages : state.capturedImages);
        const loadedImgs = await Promise.all(renderList.map(src => src ? loadImage(src) : Promise.resolve(null)));

        const slotRects = [];

        if (state.layoutType === 'strip') {
            const headerFooterHeight = 280;
            const availableHeight = targetCanvas.height - (pad * 5) - headerFooterHeight;
            const photoHeight = availableHeight / 4;
            const photoWidth = availableWidth - (pad * 2);

            for (let i = 0; i < 4; i++) {
                const x = sideFilmMargin + pad;
                const y = pad + i * (photoHeight + pad);
                slotRects.push({ x, y, w: photoWidth, h: photoHeight, index: i });
                if (loadedImgs[i]) {
                    drawFilteredImage(ctx, loadedImgs[i], x, y, photoWidth, photoHeight);
                } else {
                    drawEmptySlotPlaceholder(ctx, x, y, photoWidth, photoHeight, `Ô ${i + 1} (Trống)`);
                }
            }

            drawFooterBrand(ctx, targetCanvas, targetCanvas.height - headerFooterHeight / 2);

        } else if (state.layoutType === 'grid2x2') {
            const footerHeight = 220;
            const photoWidth = (availableWidth - (pad * 3)) / 2;
            const photoHeight = (targetCanvas.height - (pad * 3) - footerHeight) / 2;

            const coords = [
                { x: sideFilmMargin + pad, y: pad },
                { x: sideFilmMargin + pad * 2 + photoWidth, y: pad },
                { x: sideFilmMargin + pad, y: pad * 2 + photoHeight },
                { x: sideFilmMargin + pad * 2 + photoWidth, y: pad * 2 + photoHeight }
            ];

            for (let i = 0; i < 4; i++) {
                if (coords[i]) {
                    slotRects.push({ x: coords[i].x, y: coords[i].y, w: photoWidth, h: photoHeight, index: i });
                    if (loadedImgs[i]) {
                        drawFilteredImage(ctx, loadedImgs[i], coords[i].x, coords[i].y, photoWidth, photoHeight);
                    } else {
                        drawEmptySlotPlaceholder(ctx, coords[i].x, coords[i].y, photoWidth, photoHeight, `Ô ${i + 1} (Trống)`);
                    }
                }
            }

            drawFooterBrand(ctx, targetCanvas, targetCanvas.height - footerHeight / 2);

        } else if (state.layoutType === 'grid3x2') {
            const footerHeight = 200;
            const photoWidth = (availableWidth - (pad * 3)) / 2;
            const photoHeight = (targetCanvas.height - (pad * 4) - footerHeight) / 3;

            for (let i = 0; i < 6; i++) {
                const row = Math.floor(i / 2);
                const col = i % 2;
                const x = sideFilmMargin + pad + col * (photoWidth + pad);
                const y = pad + row * (photoHeight + pad);
                slotRects.push({ x, y, w: photoWidth, h: photoHeight, index: i });
                if (loadedImgs[i]) {
                    drawFilteredImage(ctx, loadedImgs[i], x, y, photoWidth, photoHeight);
                } else {
                    drawEmptySlotPlaceholder(ctx, x, y, photoWidth, photoHeight, `Ô ${i + 1} (Trống)`);
                }
            }

            drawFooterBrand(ctx, targetCanvas, targetCanvas.height - footerHeight / 2);
        }

        // Draw Film Decor OVER side margins
        if (state.frameStyle === 'film') {
            ctx.save();
            ctx.fillStyle = '#08080a';
            ctx.fillRect(0, 0, 70, targetCanvas.height);
            ctx.fillRect(targetCanvas.width - 70, 0, 70, targetCanvas.height);

            ctx.fillStyle = '#ffffff';
            for (let y = 35; y < targetCanvas.height - 35; y += 75) {
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(18, y, 34, 44, 6);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.roundRect(targetCanvas.width - 52, y, 34, 44, 6);
                    ctx.fill();
                } else {
                    ctx.fillRect(18, y, 34, 44);
                    ctx.fillRect(targetCanvas.width - 52, y, 34, 44);
                }
            }
            ctx.restore();
        }

        // ----------------------------------------------------------------------
        // Draw Per-Slot Cute Motifs & Footer Accents
        // ----------------------------------------------------------------------
        const presetMotifLists = {
            kitty: ['🐱', '🍓', '🎀', '🌸', '💖', '🍒'],
            teddy: ['🧸', '🍯', '⭐', '✨', '🍪', '🌼'],
            starry: ['🌙', '🌟', '✨', '☁️', '🌠', '🔮'],
            sakura: ['🌸', '🌺', '🍃', '🌸', '💖', '🌷'],
            ribbon: ['🎀', '💖', '💗', '💎', '🌷', '🎀'],
            coolboy: ['💙', '🌊', '⚡', '🛹', '👟', '🔥'],
            gaming: ['🎮', '⚡', '🕹️', '👾', '🔥', '🏆'],
            racing: ['🏎️', '🏁', '🔥', '⚡', '🏆', '🚦'],
            denim: ['🧢', '👖', '⚡', '✨', '🎧', '🕶️'],
            y2k: ['✨', '⭐', '💖', '🔮', '🦋', '💫'],
            korean: ['🤍', '✨', '🌿', '🎀', '🌷', '🕊️'],
            polaroid: ['📸', '✨', '💌', '🌸', '💖', '🌟'],
            film: ['📼', '🎬', '🎞️', '⭐', '✨', '🖤'],
            classic: ['✨', '🌟', '💫', '⭐', '✨', '🌟']
        };

        const currentMotifs = presetMotifLists[state.frameStyle] || presetMotifLists.kitty;
        const slotIconFontSize = Math.max(55, Math.min(80, Math.round(targetCanvas.width * 0.045)));

        // 1. Draw EXACTLY ONE Unique Cute Icon on Top-Right Corner of EACH Photo Slot
        slotRects.forEach((slot, idx) => {
            const icon = currentMotifs[idx % currentMotifs.length];
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 3;
            ctx.font = `${slotIconFontSize}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(icon, slot.x + slot.w - 16, slot.y + 14);
            ctx.restore();
        });

        // 2. Draw Footer Bar Theme Icons (Left & Right of Title Text)
        const footerIconFontSize = Math.max(65, Math.min(90, Math.round(targetCanvas.width * 0.05)));
        const footerCenterY = (state.layoutType === 'strip') ? targetCanvas.height - 140 : targetCanvas.height - 110;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 3;
        ctx.font = `${footerIconFontSize}px sans-serif`;
        ctx.textBaseline = 'middle';

        // Left Footer Icon
        ctx.textAlign = 'left';
        ctx.fillText(currentMotifs[2 % currentMotifs.length], sideFilmMargin + pad + 25, footerCenterY);

        // Right Footer Icon
        ctx.textAlign = 'right';
        ctx.fillText(currentMotifs[3 % currentMotifs.length], targetCanvas.width - sideFilmMargin - pad - 25, footerCenterY);

        ctx.restore();

        drawStickers(ctx, targetCanvas);
    }

    function drawEmptySlotPlaceholder(ctx, x, y, w, h, labelText) {
        ctx.save();
        // Soft rounded corners across all frame styles for a gentle studio feel
        const cuteStyles = ['korean', 'y2k', 'kitty', 'teddy', 'starry', 'sakura', 'ribbon', 'coolboy', 'gaming', 'racing', 'denim'];
        const cornerRadius = cuteStyles.includes(state.frameStyle) ? 26 : 18;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        if (cornerRadius > 0 && ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, cornerRadius);
            ctx.fill();
        } else {
            ctx.fillRect(x, y, w, h);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 12]);
        if (cornerRadius > 0 && ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x + 4, y + 4, w - 8, h - 8, Math.max(0, cornerRadius - 4));
            ctx.stroke();
        } else {
            ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 36px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, x + w / 2, y + h / 2);
        ctx.restore();
    }

    function drawFilteredImage(ctx, img, x, y, w, h) {
        ctx.save();
        ctx.beginPath();

        // Soft rounded corners across all frame styles for a gentle studio feel
        const cuteStyles = ['korean', 'y2k', 'kitty', 'teddy', 'starry', 'sakura', 'ribbon', 'coolboy', 'gaming', 'racing', 'denim'];
        const cornerRadius = cuteStyles.includes(state.frameStyle) ? 26 : 18;
        if (cornerRadius > 0 && ctx.roundRect) {
            ctx.roundRect(x, y, w, h, cornerRadius);
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.clip();

        if (state.activeFilter === 'bw') {
            ctx.filter = 'grayscale(100%) contrast(110%)';
        } else if (state.activeFilter === 'vintage') {
            ctx.filter = 'sepia(45%) contrast(115%) brightness(95%)';
        } else if (state.activeFilter === 'warm') {
            ctx.filter = 'sepia(20%) saturate(140%) hue-rotate(-10deg)';
        } else if (state.activeFilter === 'cool') {
            ctx.filter = 'hue-rotate(25deg) saturate(120%)';
        } else if (state.activeFilter === 'bright') {
            ctx.filter = 'brightness(115%) contrast(105%)';
        } else {
            ctx.filter = 'none';
        }

        const imgAspect = img.width / img.height;
        const boxAspect = w / h;
        let renderW, renderH, offsetX, offsetY;

        if (imgAspect > boxAspect) {
            renderH = h;
            renderW = h * imgAspect;
            offsetX = x - (renderW - w) / 2;
            offsetY = y;
        } else {
            renderW = w;
            renderH = w / imgAspect;
            offsetX = x;
            offsetY = y - (renderH - h) / 2;
        }

        ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
        ctx.restore();

        if (cuteStyles.includes(state.frameStyle)) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 4;
            if (cornerRadius > 0 && ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, cornerRadius);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    function drawFooterBrand(ctx, canvas, centerY) {
        ctx.save();
        let textColor = state.textColor;
        const darkStyles = ['film', 'starry', 'coolboy', 'gaming', 'racing', 'denim'];
        // On dark frames, ensure text is bright (#ffffff) if it was dark
        if (darkStyles.includes(state.frameStyle) && (textColor === '#111111' || textColor === '#000000')) {
            textColor = (state.frameStyle === 'gaming') ? '#10b981' : '#ffffff';
        }
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.font = 'bold 44px Outfit, sans-serif';
        ctx.fillText(state.frameTitle.toUpperCase(), canvas.width / 2, centerY - 15);

        ctx.font = '500 28px Outfit, sans-serif';
        ctx.fillText(`✨ ${state.frameDate} ✨`, canvas.width / 2, centerY + 30);
        ctx.restore();
    }

    function drawStickers(ctx, canvas) {
        state.stickers.forEach(stk => {
            ctx.save();
            const posX = stk.x * canvas.width;
            const posY = stk.y * canvas.height;
            const fontSize = 80 * (stk.scale || 1.0);

            ctx.translate(posX, posY);
            if (stk.rotate) {
                ctx.rotate((stk.rotate * Math.PI) / 180);
            }

            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(stk.emoji, 0, 0);

            if (stk.id === state.selectedStickerId) {
                ctx.strokeStyle = '#ff5e97';
                ctx.lineWidth = 4;
                ctx.setLineDash([8, 8]);
                ctx.strokeRect(-fontSize * 0.6, -fontSize * 0.6, fontSize * 1.2, fontSize * 1.2);
            }

            ctx.restore();
        });
    }

    // ==========================================================================
    // 10. INTERACTIVE DRAG & DROP STICKERS LOGIC
    // ==========================================================================
    let isDraggingSticker = false;

    function addSticker(emoji) {
        const newSticker = {
            id: 'stk_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            emoji: emoji || '❤️',
            x: 0.5,
            y: 0.5,
            scale: 1.0,
            rotate: 0
        };
        state.stickers.push(newSticker);
        state.selectedStickerId = newSticker.id;
        updateStickerControlPanel();
        renderPhotoboothCanvas();
    }

    function getSelectedSticker() {
        return state.stickers.find(s => s.id === state.selectedStickerId) || null;
    }

    function removeSelectedSticker() {
        if (!state.selectedStickerId) return;
        state.stickers = state.stickers.filter(s => s.id !== state.selectedStickerId);
        state.selectedStickerId = null;
        updateStickerControlPanel();
        renderPhotoboothCanvas();
    }

    function updateStickerControlPanel() {
        const selectedStk = getSelectedSticker();
        if (selectedStk) {
            if (elements.stickerScaleSlider) elements.stickerScaleSlider.value = selectedStk.scale || 1.0;
            if (elements.stickerRotateSlider) elements.stickerRotateSlider.value = selectedStk.rotate || 0;
            if (elements.deleteSelectedStickerBtn) elements.deleteSelectedStickerBtn.disabled = false;
        } else {
            if (elements.deleteSelectedStickerBtn) elements.deleteSelectedStickerBtn.disabled = true;
        }
    }

    function getCanvasRelativeCoords(e) {
        const canvas = elements.photoboothCanvas;
        if (!canvas) return { x: 0.5, y: 0.5 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width)),
            y: Math.max(0.05, Math.min(0.95, (clientY - rect.top) / rect.height))
        };
    }

    if (elements.photoboothCanvas) {
        elements.photoboothCanvas.addEventListener('mousedown', (e) => {
            if (state.stickers.length === 0) return;
            const coords = getCanvasRelativeCoords(e);
            let hit = false;
            for (let i = state.stickers.length - 1; i >= 0; i--) {
                const stk = state.stickers[i];
                if (Math.hypot(stk.x - coords.x, stk.y - coords.y) <= 0.12 * (stk.scale || 1.0)) {
                    state.selectedStickerId = stk.id;
                    isDraggingSticker = true;
                    hit = true;
                    updateStickerControlPanel();
                    renderPhotoboothCanvas();
                    break;
                }
            }
            if (!hit) {
                state.selectedStickerId = null;
                updateStickerControlPanel();
                renderPhotoboothCanvas();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingSticker || !state.selectedStickerId) return;
            const coords = getCanvasRelativeCoords(e);
            const stk = getSelectedSticker();
            if (stk) {
                stk.x = coords.x;
                stk.y = coords.y;
                renderPhotoboothCanvas();
            }
        });

        window.addEventListener('mouseup', () => { isDraggingSticker = false; });
    }

    // ==========================================================================
    // 11. EDITOR EVENT BINDINGS & CONTROLS
    // ==========================================================================
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.tabBtns.forEach(b => b.classList.remove('active'));
            elements.tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            playSound('pop');
        });
    });

    elements.framePresetCards.forEach(card => {
        card.addEventListener('click', () => {
            elements.framePresetCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const style = card.dataset.framestyle;
            state.frameStyle = style;

            if (style === 'coolboy') {
                state.frameBgColor = 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)';
                state.textColor = '#ffffff';
            } else if (style === 'gaming') {
                state.frameBgColor = 'linear-gradient(135deg, #09090b 0%, #18181b 100%)';
                state.textColor = '#10b981';
            } else if (style === 'racing') {
                state.frameBgColor = 'linear-gradient(135deg, #1f2937 0%, #111827 100%)';
                state.textColor = '#ffffff';
            } else if (style === 'denim') {
                state.frameBgColor = 'linear-gradient(135deg, #1e293b 0%, #334155 100%)';
                state.textColor = '#ffffff';
            } else if (style === 'kitty') {
                state.frameBgColor = 'linear-gradient(135deg, #ffc6d9 0%, #ffabe1 100%)';
                state.textColor = '#5d2e38';
            } else if (style === 'teddy') {
                state.frameBgColor = 'linear-gradient(135deg, #f3d5b5 0%, #e7bc91 100%)';
                state.textColor = '#4a2c11';
            } else if (style === 'starry') {
                state.frameBgColor = 'linear-gradient(135deg, #311b92 0%, #4a148c 100%)';
                state.textColor = '#ffffff';
            } else if (style === 'sakura') {
                state.frameBgColor = 'linear-gradient(135deg, #ffe5ec 0%, #ffcad4 100%)';
                state.textColor = '#6b3042';
            } else if (style === 'ribbon') {
                state.frameBgColor = 'linear-gradient(135deg, #fbe7f1 0%, #e8d5e5 100%)';
                state.textColor = '#4a223b';
            } else if (style === 'korean') {
                state.frameBgColor = '#f7f4ef';
                state.textColor = '#111111';
            } else if (style === 'y2k') {
                state.frameBgColor = 'linear-gradient(135deg, #d8b4fe 0%, #818cf8 100%)';
                state.textColor = '#ffffff';
            } else if (style === 'polaroid') {
                state.frameBgColor = '#ffffff';
                state.textColor = '#222222';
            } else if (style === 'film') {
                state.frameBgColor = '#0a0a0d';
                state.textColor = '#ffffff';
            } else if (style === 'classic') {
                state.frameBgColor = '#ffffff';
                state.textColor = '#111111';
            }

            playSound('pop');
            renderPhotoboothCanvas();
        });
    });

    elements.frameStyleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.frameStyleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.frameStyle = btn.dataset.framestyle;
            if (state.frameStyle === 'film') {
                if (state.textColor === '#111111' || state.textColor === '#000000') {
                    state.textColor = '#ffffff';
                }
            }
            renderPhotoboothCanvas();
        });
    });

    elements.colorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            elements.colorDots.forEach(d => d.classList.remove('active'));
            elements.gradientDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            state.frameBgColor = dot.dataset.color;
            renderPhotoboothCanvas();
        });
    });

    if (elements.customColorPicker) {
        elements.customColorPicker.addEventListener('input', (e) => {
            elements.colorDots.forEach(d => d.classList.remove('active'));
            elements.gradientDots.forEach(d => d.classList.remove('active'));
            state.frameBgColor = e.target.value;
            renderPhotoboothCanvas();
        });
    }

    elements.gradientDots.forEach(dot => {
        dot.addEventListener('click', () => {
            elements.colorDots.forEach(d => d.classList.remove('active'));
            elements.gradientDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            state.frameBgColor = dot.dataset.grad;
            renderPhotoboothCanvas();
        });
    });

    elements.textColorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            elements.textColorDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            state.textColor = dot.dataset.textcolor;
            renderPhotoboothCanvas();
        });
    });

    elements.filterCards.forEach(card => {
        card.addEventListener('click', () => {
            elements.filterCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.activeFilter = card.dataset.filter;
            renderPhotoboothCanvas();
        });
    });

    elements.paddingSlider.addEventListener('input', (e) => {
        state.framePadding = parseInt(e.target.value, 10);
        renderPhotoboothCanvas();
    });

    elements.frameTitleInput.addEventListener('input', (e) => {
        state.frameTitle = e.target.value;
        renderPhotoboothCanvas();
    });

    elements.frameDateInput.addEventListener('input', (e) => {
        state.frameDate = e.target.value;
        renderPhotoboothCanvas();
    });

    elements.stickerItems.forEach(item => {
        item.addEventListener('click', () => {
            addSticker(item.dataset.emoji);
        });
    });

    if (elements.addCustomEmojiBtn && elements.customEmojiInput) {
        elements.addCustomEmojiBtn.addEventListener('click', () => {
            const val = elements.customEmojiInput.value.trim();
            if (val) {
                addSticker(val);
                elements.customEmojiInput.value = '';
            }
        });
    }

    if (elements.stickerScaleSlider) {
        elements.stickerScaleSlider.addEventListener('input', (e) => {
            const stk = getSelectedSticker();
            if (stk) {
                stk.scale = parseFloat(e.target.value);
                renderPhotoboothCanvas();
            }
        });
    }

    if (elements.stickerRotateSlider) {
        elements.stickerRotateSlider.addEventListener('input', (e) => {
            const stk = getSelectedSticker();
            if (stk) {
                stk.rotate = parseInt(e.target.value, 10);
                renderPhotoboothCanvas();
            }
        });
    }

    if (elements.deleteSelectedStickerBtn) {
        elements.deleteSelectedStickerBtn.addEventListener('click', () => {
            removeSelectedSticker();
        });
    }

    elements.clearStickersBtn.addEventListener('click', () => {
        state.stickers = [];
        state.selectedStickerId = null;
        updateStickerControlPanel();
        renderPhotoboothCanvas();
    });

    elements.retakeAllBtn.addEventListener('click', () => {
        state.capturedImages = [];
        state.selectedPhotoIndices = [];
        state.chosenImages = [];
        state.currentShotIndex = 0;
        state.isCapturing = true;
        renderThumbnailsSidebar();
        switchScreen(elements.screenCapture);
        runCaptureLoop();
    });

    function createMotionGif(imagesList) {
        return new Promise(resolve => {
            if (typeof gifshot !== 'undefined' && imagesList && imagesList.length > 0) {
                const validList = imagesList.filter(Boolean);
                gifshot.createGIF({
                    images: validList,
                    interval: 0.4,
                    gifWidth: 320,
                    gifHeight: 420,
                    numFrames: validList.length
                }, function (obj) {
                    if (!obj.error) {
                        resolve(obj.image);
                    } else {
                        resolve(null);
                    }
                });
            } else {
                resolve(null);
            }
        });
    }

    // ==========================================================================
    // 12. FINALIZE, EXPORT & GALLERY MODAL
    // ==========================================================================
    elements.finishEditBtn.addEventListener('click', async () => {
        state.selectedStickerId = null;
        await renderPhotoboothCanvas();

        const finalDataUrl = elements.photoboothCanvas.toDataURL('image/png');
        elements.finalImagePreview.src = finalDataUrl;
        elements.printableImage.src = finalDataUrl;

        // Instantly switch to Result screen without blocking user UI!
        switchScreen(elements.screenResult);

        if (window.confetti) {
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        }

        const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        let shareUrl = `${window.location.protocol}//${window.location.host}${basePath}view.html?id=${photoId}`;

        if (elements.uploadStatusNotice) {
            elements.uploadStatusNotice.style.color = '#eccc68';
            elements.uploadStatusNotice.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tự động lưu ảnh HD & GIF...';
        }

        const renderQR = (url) => {
            elements.qrcodeCanvas.innerHTML = '';
            if (typeof QRCode !== 'undefined') {
                new QRCode(elements.qrcodeCanvas, {
                    text: url,
                    width: 180,
                    height: 180,
                    colorDark: '#0f1015',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                elements.qrcodeCanvas.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}" alt="QR Code" style="border-radius: 12px; width: 180px; height: 180px;">`;
            }
        };

        renderQR(shareUrl);

        // Run GIF Creation & Server/Supabase Upload Asynchronously in Background
        (async () => {
            const gifList = state.chosenImages.length > 0 ? state.chosenImages : state.capturedImages;
            const gifDataUrl = await createMotionGif(gifList);
            state.generatedGifDataUrl = gifDataUrl;

            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image: finalDataUrl,
                        gifImage: gifDataUrl,
                        layoutType: state.layoutType,
                        frameTitle: state.frameTitle,
                        deviceSessionId: deviceSessionId
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.shareUrl) {
                        shareUrl = data.shareUrl;
                        renderQR(shareUrl);
                        if (elements.uploadStatusNotice) {
                            elements.uploadStatusNotice.style.color = '#2ed573';
                            elements.uploadStatusNotice.innerHTML = `<i class="fa-solid fa-cloud-check"></i> Đã lưu trữ thành công trên Cloud Server!`;
                        }
                        return;
                    }
                }
            } catch (e) {}

            try {
                localStorage.setItem('photobooth_photo_latest', finalDataUrl);
                localStorage.setItem('photobooth_photo_' + photoId, finalDataUrl);
            } catch (e) {}

            if (elements.uploadStatusNotice) {
                elements.uploadStatusNotice.style.color = '#2ed573';
                elements.uploadStatusNotice.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã hoàn tất xuất dải ảnh HD!';
            }
        })();

        if (window.confetti) {
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        }
    });

    elements.downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `Photobooth_${Date.now()}.png`;
        link.href = elements.photoboothCanvas.toDataURL('image/png');
        link.click();
    });

    if (elements.downloadGifBtn) {
        elements.downloadGifBtn.addEventListener('click', () => {
            if (state.generatedGifDataUrl) {
                const link = document.createElement('a');
                link.download = `Photobooth_Motion_${Date.now()}.gif`;
                link.href = state.generatedGifDataUrl;
                link.click();
            } else {
                alert('File GIF đang được tạo, vui lòng thử lại sau giây lát!');
            }
        });
    }

    elements.printBtn.addEventListener('click', () => { window.print(); });
    elements.newSessionBtn.addEventListener('click', () => { switchScreen(elements.screenWelcome); });

    elements.fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.log(e));
        } else {
            document.exitFullscreen();
        }
    });

    // Gallery Modal Handlers
    function openGalleryModal() {
        if (elements.galleryModal) {
            elements.galleryModal.classList.add('active');
            loadGalleryPhotos();
        }
    }

    function closeGalleryModal() {
        if (elements.galleryModal) elements.galleryModal.classList.remove('active');
    }

    if (elements.openGalleryBtn) elements.openGalleryBtn.addEventListener('click', openGalleryModal);
    if (elements.headerGalleryBtn) elements.headerGalleryBtn.addEventListener('click', openGalleryModal);
    if (elements.closeGalleryBtn) elements.closeGalleryBtn.addEventListener('click', closeGalleryModal);
    if (elements.galleryModal) {
        elements.galleryModal.addEventListener('click', (e) => {
            if (e.target === elements.galleryModal) closeGalleryModal();
        });
    }

    let selectedGalleryPhotoIds = new Set();
    let allGalleryPhotos = [];

    function updateGalleryToolbarUI() {
        const total = allGalleryPhotos.length;
        const selectedCount = selectedGalleryPhotoIds.size;

        if (elements.galleryTotalCount) elements.galleryTotalCount.textContent = total;
        if (elements.gallerySelectedCount) elements.gallerySelectedCount.textContent = selectedCount;
        if (elements.galleryDeleteSelectedCount) elements.galleryDeleteSelectedCount.textContent = selectedCount;

        if (elements.deleteSelectedGalleryBtn) {
            elements.deleteSelectedGalleryBtn.disabled = (selectedCount === 0);
        }

        if (elements.gallerySelectAllCb) {
            elements.gallerySelectAllCb.checked = (total > 0 && selectedCount === total);
        }
    }

    async function loadGalleryPhotos() {
        if (!elements.galleryGrid) return;
        selectedGalleryPhotoIds.clear();
        allGalleryPhotos = [];
        updateGalleryToolbarUI();

        elements.galleryGrid.innerHTML = '<div class="gallery-loading"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu...</div>';

        try {
            const res = await fetch(`/api/photos?sessionId=${encodeURIComponent(deviceSessionId)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.photos && data.photos.length > 0) {
                    allGalleryPhotos = data.photos;
                    updateGalleryToolbarUI();

                    elements.galleryGrid.innerHTML = data.photos.map(p => {
                        const thumbSrc = (p.localPath && p.localPath.startsWith('/uploads'))
                            ? p.localPath
                            : (p.fileName ? '/uploads/' + p.fileName : p.imageUrl);

                        return `
                            <div class="gallery-item" data-id="${p.id}" id="gallery-item-${p.id}">
                                <div class="gallery-item-select" onclick="event.stopPropagation();">
                                    <label class="gallery-card-cb-label">
                                        <input type="checkbox" class="gallery-item-cb" data-id="${p.id}">
                                        <span class="gallery-card-cb-box"><i class="fa-solid fa-check"></i></span>
                                    </label>
                                </div>
                                <img src="${thumbSrc}" alt="${p.id}" class="gallery-thumb" loading="lazy" onerror="this.src='${p.imageUrl}'">
                                <div class="gallery-info">
                                    <span><i class="fa-solid fa-calendar-day"></i> ${new Date(p.createdAt).toLocaleDateString('vi-VN')}</span>
                                    <span>${(p.layoutType || 'strip').toUpperCase()}</span>
                                </div>
                                <div class="gallery-actions" onclick="event.stopPropagation();">
                                    <a href="view.html?id=${p.id}" target="_blank" class="gallery-btn view-btn">
                                        <i class="fa-solid fa-eye"></i> Xem / Tải
                                    </a>
                                    <button class="gallery-btn del-btn" onclick="deleteGalleryPhoto('${p.id}')">
                                        <i class="fa-solid fa-trash"></i> Xóa
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');

                    data.photos.forEach(p => {
                        const itemEl = document.getElementById(`gallery-item-${p.id}`);
                        const cbEl = itemEl ? itemEl.querySelector('.gallery-item-cb') : null;

                        const toggleItem = (forceState) => {
                            const newState = forceState !== undefined ? forceState : !selectedGalleryPhotoIds.has(p.id);
                            if (newState) {
                                selectedGalleryPhotoIds.add(p.id);
                                if (itemEl) itemEl.classList.add('selected');
                                if (cbEl) cbEl.checked = true;
                            } else {
                                selectedGalleryPhotoIds.delete(p.id);
                                if (itemEl) itemEl.classList.remove('selected');
                                if (cbEl) cbEl.checked = false;
                            }
                            updateGalleryToolbarUI();
                        };

                        if (itemEl) {
                            itemEl.addEventListener('click', () => toggleItem());
                        }
                        if (cbEl) {
                            cbEl.addEventListener('change', (e) => toggleItem(e.target.checked));
                        }
                    });

                    return;
                }
            }
        } catch (e) {}

        allGalleryPhotos = [];
        updateGalleryToolbarUI();
        elements.galleryGrid.innerHTML = '<div class="gallery-empty"><i class="fa-solid fa-folder-open" style="font-size: 32px; margin-bottom: 10px; display: block;"></i> Chưa có ảnh nào trên máy chủ</div>';
    }

    if (elements.gallerySelectAllCb) {
        elements.gallerySelectAllCb.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            allGalleryPhotos.forEach(p => {
                const itemEl = document.getElementById(`gallery-item-${p.id}`);
                const cbEl = itemEl ? itemEl.querySelector('.gallery-item-cb') : null;
                if (isChecked) {
                    selectedGalleryPhotoIds.add(p.id);
                    if (itemEl) itemEl.classList.add('selected');
                    if (cbEl) cbEl.checked = true;
                } else {
                    selectedGalleryPhotoIds.delete(p.id);
                    if (itemEl) itemEl.classList.remove('selected');
                    if (cbEl) cbEl.checked = false;
                }
            });
            updateGalleryToolbarUI();
        });
    }

    if (elements.deleteSelectedGalleryBtn) {
        elements.deleteSelectedGalleryBtn.addEventListener('click', async () => {
            const count = selectedGalleryPhotoIds.size;
            if (count === 0) return;

            if (!confirm(`Bạn có chắc chắn muốn xóa ${count} bức ảnh đã chọn khỏi server?`)) return;

            try {
                const res = await fetch('/api/photos/delete-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: Array.from(selectedGalleryPhotoIds), sessionId: deviceSessionId })
                });
                if (res.ok) {
                    playSound('pop');
                    loadGalleryPhotos();
                }
            } catch (e) {
                alert('Có lỗi khi xóa ảnh: ' + e.message);
            }
        });
    }

    if (elements.deleteAllGalleryBtn) {
        elements.deleteAllGalleryBtn.addEventListener('click', async () => {
            if (allGalleryPhotos.length === 0) {
                alert('Thư viện đang trống!');
                return;
            }

            if (!confirm('⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ tất cả ảnh trong thư viện server không? Hành động này KHÔNG thể hoàn tác!')) return;

            try {
                const res = await fetch('/api/photos/delete-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ all: true, sessionId: deviceSessionId })
                });
                if (res.ok) {
                    playSound('pop');
                    loadGalleryPhotos();
                }
            } catch (e) {
                alert('Có lỗi khi xóa ảnh: ' + e.message);
            }
        });
    }

    window.deleteGalleryPhoto = async function(id) {
        if (!confirm('Bạn có chắc chắn muốn xóa bức ảnh này khỏi server?')) return;
        try {
            const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
            if (res.ok) {
                playSound('pop');
                loadGalleryPhotos();
            }
        } catch (e) {}
    };

});
