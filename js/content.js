// Universal Dual Subtitles for DeepLearning.AI
// Approach: Fetch VTT, parse, and translate on-demand with caching
// Features: Always-visible drag handle, parallel translation

(function() {
  'use strict';

  let overlay = null;
  let dragHandle = null;
  let translationCache = new Map();
  let subtitleEntries = [];
  let checkInterval = null;
  let currentVttUrl = null;
  let preTranslateQueue = null;
  let videoElement = null;
  let subtitleEnabled = true;
  let showOriginal = false;
  let showTranslated = true;
  let translationEnabled = true;
  let targetLanguage = 'vi';
  let ttsEnabled = true;
  let videoMuted = true;
  let speechSynthesis = window.speechSynthesis;
  let currentUtterance = null;
  let lastSpeakTime = 0;
  let speakDebounceTimer = null;
  let speechSegments = [];
  let currentSegmentIndex = 0;
  let isSpeaking = false;
  let pausedSegmentIndex = 0;
  let pausedSegmentText = '';
  let isPaused = false;
  let ttsRetryCount = 0;
  let currentTextHash = '';
  let ttsRate = 1.5;
  let ttsPitch = 1.0;
  let voiceIndex = null;
  let availableVoices = [];
  let videoPaused = false;
  let initRetryCount = 0;
  let isInitialized = false;

  const CONFIG = {
    overlayBackground: 'rgba(0, 0, 0, 0.85)',
    originalColor: '#ffd700',
    translatedColor: '#ffffff',
    fontSize: '18px',
    syncInterval: 100,
    batchSize: 5,
    preTranslateCount: 50,
    debug: true
  };

  function log(...args) {
    if (CONFIG.debug) {
      console.log('[DualSub]', ...args);
    }
  }

  function error(...args) {
    console.error('[DualSub ERROR]', ...args);
  }

  // =====================
  // PARSE VTT FILE
  // =====================
  function parseVTT(vttText) {
    const lines = vttText.split('\n');
    const entries = [];
    let i = 0;

    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.includes('-->')) {
        const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (timeMatch) {
          const startTime = parseTimestamp(timeMatch[1]);
          const endTime = parseTimestamp(timeMatch[2]);

          let text = '';
          i++;
          while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
            text += lines[i].trim() + ' ';
            i++;
          }

          text = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

          if (text) {
            entries.push({ startTime, endTime, text, translated: null });
          }
          continue;
        }
      }
      i++;
    }

    log(`Parsed ${entries.length} subtitle entries`);
    return entries;
  }

  function parseTimestamp(ts) {
    const parts = ts.split(':');
    return (parseInt(parts[0]) || 0) * 3600 + (parseInt(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
  }

  // =====================
  // FETCH SUBTITLES
  // =====================
  function getSubtitleUrl(video) {
    const track = document.querySelector('track[srclang="en"], track[srclang*="en"], track[label*="English" i], track[label*="english" i]');

    if (track && track.src) {
      log('Found track element with src:', track.src);

      let vttUrl = track.src;
      if (vttUrl.endsWith('.m3u8')) {
        vttUrl = vttUrl.replace('.m3u8', '.vtt');
        log('Converted m3u8 to vtt:', vttUrl);
      }

      return vttUrl;
    }

    return null;
  }

  async function fetchSubtitles(vttUrl) {
    if (currentVttUrl === vttUrl && subtitleEntries.length > 0) {
      log('Using cached subtitles');
      return subtitleEntries;
    }

    log('Fetching subtitles from:', vttUrl);

    try {
      const response = await fetch(vttUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const vttText = await response.text();
      subtitleEntries = parseVTT(vttText);
      currentVttUrl = vttUrl;

      log(`Loaded ${subtitleEntries.length} subtitles`);
      return subtitleEntries;
    } catch (err) {
      error('Failed to fetch subtitles:', err);
      return [];
    }
  }

  // =====================
  // TRANSLATE (FAST - PARALLEL)
  // =====================
  function translateText(text) {
    const cacheKey = `${targetLanguage}:${text}`;

    if (translationCache.has(cacheKey)) {
      return Promise.resolve(translationCache.get(cacheKey));
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`;

    return fetch(url)
      .then(r => r.json())
      .then(data => {
        let translated = '';
        if (data[0]) {
          for (let i = 0; i < data[0].length; i++) {
            translated += data[0][i][0];
          }
        }
        translationCache.set(cacheKey, translated);
        return translated || text;
      })
      .catch(err => {
        error('Translation failed:', err);
        return text;
      });
  }

  async function preTranslateBatch(entries) {
    const toTranslate = entries
      .filter(e => !e.translated && !translationCache.has(`${targetLanguage}:${e.text}`))
      .slice(0, CONFIG.preTranslateCount);

    if (toTranslate.length === 0) {
      log('All entries already translated or cached');
      return;
    }

    log(`Pre-translating ${toTranslate.length} entries in parallel batches...`);

    for (let i = 0; i < toTranslate.length; i += CONFIG.batchSize) {
      const batch = toTranslate.slice(i, i + CONFIG.batchSize);
      const promises = batch.map(entry =>
        translateText(entry.text).then(translated => {
          entry.translated = translated;
          return translated;
        })
      );

      await Promise.all(promises);
      log(`Pre-translated ${Math.min(i + CONFIG.batchSize, toTranslate.length)}/${toTranslate.length}`);
    }

    log('Pre-translation complete');
  }

  // =====================
  // TEXT-TO-SPEECH (Vietnamese)
  // =====================
  function speakVietnamese(text) {
    if (!ttsEnabled || !text || text === 'Đang dịch...' || videoPaused) {
      log('Skipping TTS: enabled=' + ttsEnabled + ', text=' + !!text + ', paused=' + videoPaused);
      return;
    }

    const textHash = text.substring(0, 30);

    if (textHash === currentTextHash) {
      log('Same text as current, isSpeaking:', isSpeaking);
      if (isSpeaking) {
        return;
      }
    }

    currentTextHash = textHash;

    const now = Date.now();

    if (speakDebounceTimer) {
      clearTimeout(speakDebounceTimer);
    }

    speakDebounceTimer = setTimeout(() => {
      const timeSinceLastSpeak = now - lastSpeakTime;

      if (timeSinceLastSpeak < 200) {
        log('Too soon to speak, debouncing');
        return;
      }

      lastSpeakTime = Date.now();

      if (!videoPaused) {
        log('Starting TTS for text:', text.substring(0, 50) + '...');
        log('Current state - isSpeaking:', isSpeaking, 'speechSegments:', speechSegments.length);

        speechSynthesis.cancel();

        const segments = splitTextIntoSegments(text);

        if (segments.length === 0) {
          log('No segments to speak');
          return;
        }

        log('Text split into', segments.length, 'segments');

        currentSegmentIndex = 0;
        pausedSegmentIndex = 0;
        speechSegments = segments;

        log('Starting to speak from segment 0');
        startSpeakingFromSegment(0);
      } else {
        log('Video paused, not starting TTS');
      }
    }, 150);
  }

  function splitTextIntoSegments(text) {
    text = text.replace(/\s+/g, ' ').trim();
    log('Splitting text:', text.substring(0, 100) + '...');

    const sentences = [];

    const splitPoints = [];

    const sentenceEndRegex = /[.!?]+(\s+|$)/g;
    let match;
    while ((match = sentenceEndRegex.exec(text)) !== null) {
      splitPoints.push({
        index: match.index,
        end: match.index + match[0].length,
        type: 'sentence'
      });
    }

    const commaRegex = /[,;]+(\s+|$)/g;
    while ((match = commaRegex.exec(text)) !== null) {
      splitPoints.push({
        index: match.index,
        end: match.index + match[0].length,
        type: 'comma'
      });
    }

    splitPoints.sort((a, b) => a.index - b.index);

    let lastEnd = 0;

    for (const point of splitPoints) {
      if (point.index < lastEnd) continue;

      const segment = text.substring(lastEnd, point.end).trim();

      if (!segment) continue;

      if (point.type === 'sentence') {
        sentences.push(segment);
        lastEnd = point.end;
      } else if (point.type === 'comma') {
        const words = segment.split(/\s+/);
        const lastWord = words[words.length - 1] || '';
        const lastWordClean = lastWord.toLowerCase().replace(/[,;]/g, '');

        const connectives = [
          'and', 'or', 'but', 'yet', 'so', 'nor', 'for',
          'và', 'hoặc', 'nhưng', 'nên', 'vì', 'tuy', 'tuy nhiên',
          'song', 'mà', 'để', 'khiến cho', 'làm cho'
        ];

        if (!connectives.includes(lastWordClean)) {
          sentences.push(segment);
          lastEnd = point.end;
        }
      }
    }

    const remaining = text.substring(lastEnd).trim();
    if (remaining) {
      sentences.push(remaining);
    }

    const result = sentences.filter(s => s.length > 0);
    log('Split into', result.length, 'segments');
    result.forEach((s, i) => {
      log(`  ${i + 1}. "${s.substring(0, 40)}..."`);
    });

    return result;
  }

  function startSpeakingFromSegment(index) {
    if (index >= speechSegments.length) {
      isSpeaking = false;
      currentSegmentIndex = 0;
      speechSegments = [];
      pausedSegmentIndex = 0;
      log('Finished all segments');
      return;
    }

    isSpeaking = true;
    currentSegmentIndex = index;
    pausedSegmentIndex = index;

    const segment = speechSegments[index];
    log('Speaking segment', index, ':', segment);

    const utterance = new SpeechSynthesisUtterance(segment);
    utterance.lang = targetLanguage + '-' + targetLanguage.toUpperCase();
    utterance.rate = ttsRate;
    utterance.pitch = ttsPitch;
    utterance.volume = 1.0;

    const voices = speechSynthesis.getVoices();
    if (voiceIndex !== null && voices[voiceIndex]) {
      utterance.voice = voices[voiceIndex];
      log('Using voice index:', voiceIndex, voices[voiceIndex].name);
    } else {
      const targetVoice = voices.find(v => v.lang.startsWith(targetLanguage));
      if (targetVoice) {
        utterance.voice = targetVoice;
        voiceIndex = voices.indexOf(targetVoice);
        log('Auto-selected voice:', targetVoice.name);
      } else {
        log(`WARNING: No ${targetLanguage} voice found, using default`);
      }
    }

    log('Speaking with rate:', utterance.rate, 'pitch:', utterance.pitch);

    let utteranceStarted = false;

    utterance.onstart = () => {
      log('✓ TTS started for segment', index);
      pausedSegmentText = segment;
      ttsRetryCount = 0;
      utteranceStarted = true;
    };

    utterance.onend = () => {
      log('✓ TTS ended for segment', index);
      pausedSegmentText = '';
      pausedSegmentIndex = index + 1;
      setTimeout(() => {
        if (isSpeaking && speechSegments.length > 0 && index + 1 < speechSegments.length) {
          log('Moving to next segment', index + 1);
          startSpeakingFromSegment(index + 1);
        } else {
          isSpeaking = false;
          log('Finished speaking all segments');
        }
      }, 50);
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        pausedSegmentText = segment.substring(0, event.charIndex);
      }
    };

    utterance.onerror = (e) => {
      error('✗ TTS error for segment', index, ':', e.error, 'started:', utteranceStarted);

      if (e.error === 'not-allowed' || e.error === 'not-supported') {
        if (ttsRetryCount < 2) {
          ttsRetryCount++;
          log('Retrying TTS (' + ttsRetryCount + '/2) for segment', index);
          setTimeout(() => {
            startSpeakingFromSegment(index);
          }, 200);
        } else {
          log('TTS not allowed after retries, skipping');
          isSpeaking = false;
          pausedSegmentText = '';
          speechSegments = [];
          currentTextHash = '';
          pausedSegmentIndex = 0;
        }
      } else if (e.error !== 'interrupted' && e.error !== 'canceled') {
        if (isSpeaking) {
          log('TTS error, moving to next segment');
          setTimeout(() => {
            startSpeakingFromSegment(index + 1);
          }, 100);
        } else {
          isSpeaking = false;
          log('Not speaking anymore after error');
        }
      } else {
        if (!utteranceStarted) {
          isSpeaking = false;
          log('TTS error before start, clearing speaking state');
        }
      }
    };

    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
    log('speechSynthesis.speak() called');
  }

  function pauseSpeaking() {
    isPaused = true;
    if (speechSynthesis.speaking) {
      pausedSegmentIndex = currentSegmentIndex;
      pausedSegmentText = speechSegments[currentSegmentIndex] || '';
      speechSynthesis.cancel();
      log('✓ Paused at segment', pausedSegmentIndex, ':', pausedSegmentText);
    } else {
      log('Nothing to pause, not speaking');
    }
  }

  function resumeSpeaking() {
    isPaused = false;
    log('Resume called. Segments:', speechSegments.length, 'Paused index:', pausedSegmentIndex);
    if (speechSegments.length > 0 && pausedSegmentIndex < speechSegments.length) {
      log('✓ Resuming from segment', pausedSegmentIndex, ':', speechSegments[pausedSegmentIndex]);
      currentTextHash = '';
      startSpeakingFromSegment(pausedSegmentIndex);
    } else {
      log('Cannot resume: no segments or invalid index');
    }
  }

  function stopSpeaking() {
    isSpeaking = false;
    isPaused = false;
    currentSegmentIndex = 0;
    pausedSegmentIndex = 0;
    speechSegments = [];
    pausedSegmentText = '';
    currentTextHash = '';
    ttsRetryCount = 0;
    speechSynthesis.cancel();
    if (speakDebounceTimer) {
      clearTimeout(speakDebounceTimer);
      speakDebounceTimer = null;
    }
  }

  function resetTTSState() {
    stopSpeaking();
    videoPaused = false;
  }

  function loadVoices() {
    availableVoices = speechSynthesis.getVoices();
    const langVoices = availableVoices.filter(v => v.lang.startsWith(targetLanguage));
    log('Loaded voices:', availableVoices.length, `${targetLanguage} voices:`, langVoices.length);

    if (langVoices.length > 0) {
      langVoices.forEach((v, i) => {
        log(`  ${i + 1}. ${v.name} (${v.lang})`);
      });
    }

    if (voiceIndex === null && langVoices.length > 0) {
      voiceIndex = availableVoices.indexOf(langVoices[0]);
      log('Auto-selected voice:', langVoices[0].name);
    }
  }

  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();

  // Load voices
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {
      const voices = speechSynthesis.getVoices();
      const langVoices = voices.filter(v => v.lang.startsWith(targetLanguage));
      log('Available voices:', voices.length);
      log(`${targetLanguage} voices:`, langVoices.length);
    };
  }

  // =====================
  // CREATE DRAG HANDLE (always visible)
  // =====================
  function createDragHandle(container) {
    // Remove old handle if exists
    const oldHandle = document.getElementById('dual-subtitles-drag-handle');
    if (oldHandle) oldHandle.remove();

    const handle = document.createElement('div');
    handle.id = 'dual-subtitles-drag-handle';
    handle.innerHTML = '≡';
    handle.title = 'Kéo để di chuyển phụ đề';

    handle.style.cssText = `
      position: absolute !important;
      bottom: 15% !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      width: 40px !important;
      height: 24px !important;
      background: rgba(0, 0, 0, 0.6) !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      border-radius: 12px !important;
      color: rgba(255, 255, 255, 0.7) !important;
      font-size: 18px !important;
      line-height: 20px !important;
      text-align: center !important;
      cursor: grab !important;
      z-index: 2147483647 !important;
      user-select: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: opacity 0.3s, background 0.3s !important;
      opacity: 0.3 !important;
    `;

    // Show handle on hover
    handle.addEventListener('mouseenter', () => {
      handle.style.opacity = '1';
      handle.style.background = 'rgba(0, 0, 0, 0.8)';
    });

    handle.addEventListener('mouseleave', () => {
      if (!handle.classList.contains('dragging')) {
        handle.style.opacity = '0.3';
        handle.style.background = 'rgba(0, 0, 0, 0.6)';
      }
    });

    container.appendChild(handle);
    return handle;
  }

  // =====================
  // OVERLAY
  // =====================
  function createOverlay(video, container, dragHandleEl) {
    if (overlay && overlay.parentElement) {
      overlay.remove();
    }

    const newOverlay = document.createElement('div');
    newOverlay.id = 'dual-subtitles-overlay';
    newOverlay.innerHTML = `
      <button class="ds-reset-btn" title="Vị trí gốc">↺</button>
      <div class="ds-resize-handle ds-resize-nw" data-direction="nw"></div>
      <div class="ds-resize-handle ds-resize-ne" data-direction="ne"></div>
      <div class="ds-resize-handle ds-resize-sw" data-direction="sw"></div>
      <div class="ds-resize-handle ds-resize-se" data-direction="se"></div>
      <div class="ds-content">
        <div class="ds-original"></div>
        <div class="ds-translated"></div>
      </div>
    `;

    // Default positioning
    newOverlay.style.cssText = `
      position: absolute !important;
      left: 50% !important;
      top: auto !important;
      bottom: 15% !important;
      transform: translateX(-50%) !important;
      background: ${CONFIG.overlayBackground} !important;
      padding: 12px 24px !important;
      border-radius: 8px !important;
      max-width: 85% !important;
      min-width: 200px !important;
      width: auto !important;
      height: auto !important;
      min-height: auto !important;
      text-align: center !important;
      z-index: 2147483646 !important;
      font-size: ${CONFIG.fontSize} !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
      line-height: 1.4 !important;
      user-select: none !important;
      display: none !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
      resize: none !important;
    `;

    const contentDiv = newOverlay.querySelector('.ds-content');
    contentDiv.style.cssText = `
      pointer-events: none !important;
    `;

    const originalDiv = newOverlay.querySelector('.ds-original');
    const translatedDiv = newOverlay.querySelector('.ds-translated');

    originalDiv.style.cssText = `
      color: ${CONFIG.originalColor};
      font-weight: 600;
      margin-bottom: 6px;
    `;

    translatedDiv.style.cssText = `
      color: ${CONFIG.translatedColor};
      opacity: 0.95;
    `;

    // Reset button
    const resetBtn = newOverlay.querySelector('.ds-reset-btn');
    resetBtn.style.cssText = `
      position: absolute !important;
      top: 2px !important;
      right: 2px !important;
      background: rgba(255,255,255,0.2) !important;
      border: none !important;
      color: #fff !important;
      width: 20px !important;
      height: 20px !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      font-size: 12px !important;
      line-height: 1 !important;
      padding: 0 !important;
      opacity: 0 !important;
      transition: opacity 0.2s !important;
      pointer-events: auto !important;
    `;

    newOverlay.addEventListener('mouseenter', () => {
      resetBtn.style.opacity = '0.5';
    });

    newOverlay.addEventListener('mouseleave', () => {
      resetBtn.style.opacity = '0';
    });

    // Resize handles - 4 corners
    const resizeHandles = newOverlay.querySelectorAll('.ds-resize-handle');

    resizeHandles.forEach(handle => {
      const direction = handle.dataset.direction;

      if (direction === 'nw') {
        handle.style.cssText = `
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 20px !important;
          height: 20px !important;
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.6) 50%, transparent 50%) !important;
          border-radius: 8px 0 0 0 !important;
          cursor: nwse-resize !important;
          z-index: 2147483648 !important;
          pointer-events: auto !important;
          opacity: 0.5 !important;
          transition: opacity 0.2s !important;
        `;
      } else if (direction === 'ne') {
        handle.style.cssText = `
          position: absolute !important;
          top: 0 !important;
          right: 0 !important;
          width: 20px !important;
          height: 20px !important;
          background: linear-gradient(225deg, rgba(255, 215, 0, 0.6) 50%, transparent 50%) !important;
          border-radius: 0 8px 0 0 !important;
          cursor: nesw-resize !important;
          z-index: 2147483648 !important;
          pointer-events: auto !important;
          opacity: 0.5 !important;
          transition: opacity 0.2s !important;
        `;
      } else if (direction === 'sw') {
        handle.style.cssText = `
          position: absolute !important;
          bottom: 0 !important;
          left: 0 !important;
          width: 20px !important;
          height: 20px !important;
          background: linear-gradient(45deg, rgba(255, 215, 0, 0.6) 50%, transparent 50%) !important;
          border-radius: 0 0 0 8px !important;
          cursor: nesw-resize !important;
          z-index: 2147483648 !important;
          pointer-events: auto !important;
          opacity: 0.5 !important;
          transition: opacity 0.2s !important;
        `;
      } else if (direction === 'se') {
        handle.style.cssText = `
          position: absolute !important;
          bottom: 0 !important;
          right: 0 !important;
          width: 20px !important;
          height: 20px !important;
          background: linear-gradient(315deg, rgba(255, 215, 0, 0.6) 50%, transparent 50%) !important;
          border-radius: 0 0 8px 0 !important;
          cursor: nwse-resize !important;
          z-index: 2147483648 !important;
          pointer-events: auto !important;
          opacity: 0.5 !important;
          transition: opacity 0.2s !important;
        `;
      }

      handle.addEventListener('mouseenter', () => {
        handle.style.opacity = '1';
      });

      handle.addEventListener('mouseleave', () => {
        if (!handle.classList.contains('resizing')) {
          handle.style.opacity = '0.5';
        }
      });
    });

    container.appendChild(newOverlay);

    // === DRAG FUNCTIONALITY ===
    let isDraggingOverlay = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialBottom = 0;
    let originalPosition = { left: '50%', bottom: '15%' };

    // Shared drag function
    function startDrag(clientX, clientY) {
      isDraggingOverlay = true;
      dragHandleEl.classList.add('dragging');
      dragHandleEl.style.cursor = 'grabbing';
      dragHandleEl.style.opacity = '1';

      startX = clientX;
      startY = clientY;

      const rect = newOverlay.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Get current position (in pixels if already dragged, or computed if default)
      if (newOverlay.style.left.includes('%')) {
        initialLeft = rect.left - containerRect.left + rect.width / 2;
      } else {
        initialLeft = parseFloat(newOverlay.style.left);
      }
      if (newOverlay.style.bottom.includes('%')) {
        initialBottom = containerRect.bottom - rect.bottom;
      } else {
        initialBottom = parseFloat(newOverlay.style.bottom);
      }
    }

    function doDrag(clientX, clientY) {
      if (!isDraggingOverlay) return;

      const dx = clientX - startX;
      const dy = clientY - startY;
      const containerRect = container.getBoundingClientRect();

      let newLeft = initialLeft + dx;
      let newBottom = initialBottom - dy;

      const overlayWidth = newOverlay.offsetWidth;
      const overlayHeight = newOverlay.offsetHeight;

      newLeft = Math.max(overlayWidth / 2, Math.min(containerRect.width - overlayWidth / 2, newLeft));
      newBottom = Math.max(10, Math.min(containerRect.height - overlayHeight - 10, newBottom));

      newOverlay.style.left = newLeft + 'px';
      newOverlay.style.bottom = newBottom + 'px';
      newOverlay.style.transform = 'translateX(-50%)';

      // Move handle with overlay
      dragHandleEl.style.left = newLeft + 'px';
      dragHandleEl.style.bottom = (newBottom + overlayHeight + 5) + 'px';
      dragHandleEl.style.transform = 'translateX(-50%)';
    }

    function endDrag() {
      if (isDraggingOverlay) {
        isDraggingOverlay = false;
        dragHandleEl.classList.remove('dragging');
        dragHandleEl.style.cursor = 'grab';
        dragHandleEl.style.opacity = '0.3';
      }
    }

    // Mouse events on handle
    dragHandleEl.addEventListener('mousedown', (e) => {
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });

    // Also allow dragging from overlay (when visible)
    newOverlay.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('ds-reset-btn')) return;
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      doDrag(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', endDrag);

    // Touch events
    dragHandleEl.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
      e.preventDefault();
    });

    newOverlay.addEventListener('touchstart', (e) => {
      if (e.target.classList.contains('ds-reset-btn')) return;
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
      e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
      if (!isDraggingOverlay) return;
      const touch = e.touches[0];
      doDrag(touch.clientX, touch.clientY);
    });

    document.addEventListener('touchend', endDrag);

    // === RESIZE FUNCTIONALITY ===
    let isResizing = false;
    let resizeDirection = '';
    let resizeStartX = 0, resizeStartY = 0;
    let initialWidth = 0, initialHeight = 0;
    let resizeInitialLeft = 0, resizeInitialBottom = 0;

    function startResize(clientX, clientY, direction) {
      isResizing = true;
      resizeDirection = direction;

      resizeHandles.forEach(h => h.classList.add('resizing'));
      resizeHandles.forEach(h => h.style.opacity = '1');

      resizeStartX = clientX;
      resizeStartY = clientY;

      initialWidth = newOverlay.offsetWidth;
      initialHeight = newOverlay.offsetHeight;

      const rect = newOverlay.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      if (newOverlay.style.left.includes('%')) {
        resizeInitialLeft = rect.left - containerRect.left + rect.width / 2;
      } else {
        resizeInitialLeft = parseFloat(newOverlay.style.left);
      }
      if (newOverlay.style.bottom.includes('%')) {
        resizeInitialBottom = containerRect.bottom - rect.bottom;
      } else {
        resizeInitialBottom = parseFloat(newOverlay.style.bottom);
      }
    }

    function doResize(clientX, clientY) {
      if (!isResizing) return;

      const dx = clientX - resizeStartX;
      const dy = clientY - resizeStartY;

      let newWidth = initialWidth;
      let newHeight = initialHeight;
      let newLeft = resizeInitialLeft;
      let newBottom = resizeInitialBottom;

      if (resizeDirection.includes('e')) {
        newWidth = Math.max(200, initialWidth + dx);
      }
      if (resizeDirection.includes('w')) {
        newWidth = Math.max(200, initialWidth - dx);
        newLeft = resizeInitialLeft + dx / 2;
      }
      if (resizeDirection.includes('s')) {
        newHeight = Math.max(60, initialHeight - dy);
      }
      if (resizeDirection.includes('n')) {
        newHeight = Math.max(60, initialHeight + dy);
        newBottom = resizeInitialBottom + dy;
      }

      const containerRect = container.getBoundingClientRect();

      newLeft = Math.max(newWidth / 2, Math.min(containerRect.width - newWidth / 2, newLeft));
      newBottom = Math.max(10, Math.min(containerRect.height - newHeight - 10, newBottom));

      newOverlay.style.width = newWidth + 'px';
      newOverlay.style.maxWidth = newWidth + 'px';
      newOverlay.style.height = 'auto';
      newOverlay.style.minHeight = newHeight + 'px';

      if (resizeDirection.includes('w') || resizeDirection.includes('n')) {
        newOverlay.style.left = newLeft + 'px';
        newOverlay.style.bottom = newBottom + 'px';
        newOverlay.style.transform = 'translateX(-50%)';
      }
    }

    function endResize() {
      if (isResizing) {
        isResizing = false;
        resizeDirection = '';
        resizeHandles.forEach(h => h.classList.remove('resizing'));
        resizeHandles.forEach(h => h.style.opacity = '0.5');
      }
    }

    // Mouse events for resize
    resizeHandles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        startResize(e.clientX, e.clientY, handle.dataset.direction);
        e.preventDefault();
        e.stopPropagation();
      });

      handle.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startResize(touch.clientX, touch.clientY, handle.dataset.direction);
        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (isResizing) {
        doResize(e.clientX, e.clientY);
        e.preventDefault();
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        endResize();
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (isResizing) {
        const touch = e.touches[0];
        doResize(touch.clientX, touch.clientY);
        e.preventDefault();
      }
    });

    document.addEventListener('touchend', () => {
      if (isResizing) {
        endResize();
      }
    });

    // Reset button
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      newOverlay.style.left = originalPosition.left;
      newOverlay.style.bottom = originalPosition.bottom;
      newOverlay.style.transform = 'translateX(-50%)';
      newOverlay.style.width = 'auto';
      newOverlay.style.maxWidth = '85%';
      newOverlay.style.height = 'auto';
      newOverlay.style.minHeight = 'auto';
      dragHandleEl.style.left = '50%';
      dragHandleEl.style.bottom = originalPosition.bottom;
      dragHandleEl.style.transform = 'translateX(-50%)';
      log('Overlay position and size reset');
    });

    overlay = newOverlay;
    return newOverlay;
  }

  // =====================
  // SYNC WITH VIDEO
  // =====================
  function startVideoSync(video, entries) {
    videoElement = video;
    videoElement.muted = videoMuted;
    log('Video muted:', videoMuted);

    videoElement.addEventListener('pause', () => {
      videoPaused = true;
      if (speechSynthesis.speaking || speechSegments.length > 0) {
        pauseSpeaking();
        log('Video paused, TTS paused');
      }
    });

    videoElement.addEventListener('play', () => {
      videoPaused = false;
      resumeSpeaking();
      log('Video resumed, TTS resumed');
    });

    const originalDiv = overlay.querySelector('.ds-original');
    const translatedDiv = overlay.querySelector('.ds-translated');
    let currentText = '';
    let lastTextChange = 0;

    checkInterval = setInterval(() => {
      const currentTime = video.currentTime;

      const active = entries.find(e =>
        currentTime >= e.startTime && currentTime < e.endTime
      );

      if (active && active.text !== currentText) {
        currentText = active.text;
        lastTextChange = Date.now();

        if (subtitleEnabled) {
          overlay.style.display = 'block';

          if (showOriginal) {
            originalDiv.style.display = 'block';
            originalDiv.textContent = active.text;
          } else {
            originalDiv.style.display = 'none';
          }

          if (showTranslated && translationEnabled) {
            translatedDiv.style.display = 'block';

            if (active.translated) {
              translatedDiv.textContent = active.translated;
              speakVietnamese(active.translated);
            } else if (translationCache.has(`${targetLanguage}:${active.text}`)) {
              active.translated = translationCache.get(`${targetLanguage}:${active.text}`);
              translatedDiv.textContent = active.translated;
              speakVietnamese(active.translated);
            } else {
              translatedDiv.textContent = 'Đang dịch...';
              translateText(active.text).then(translated => {
                active.translated = translated;
                if (currentText === active.text) {
                  translatedDiv.textContent = translated;
                  speakVietnamese(translated);
                }
              });
            }
          } else {
            translatedDiv.style.display = 'none';
            stopSpeaking();
          }
        }

        log('Show:', active.text);
      } else if (!active && currentText && Date.now() - lastTextChange > 500) {
        currentText = '';
        overlay.style.display = 'none';
        stopSpeaking();
      }

    }, CONFIG.syncInterval);

    log('Video sync started');
  }

  // =====================
  // MAIN INITIALIZATION
  // =====================
  async function init() {
    if (isInitialized) {
      log('Already initialized');
      return;
    }

    log('=== Initializing Dual Subtitles (Parallel + Draggable + TTS) ===');

    const video = document.querySelector('video');
    if (!video) {
      initRetryCount++;
      if (initRetryCount < 20) {
        log(`Video not found, retrying... (${initRetryCount}/20)`);
        setTimeout(init, 1000);
      } else {
        error('No video element found after retries');
      }
      return;
    }

    videoElement = video;
    log('Found video element');

    const vttUrl = getSubtitleUrl(video);
    if (!vttUrl) {
      error('No subtitle URL found');
      return;
    }

    const entries = await fetchSubtitles(vttUrl);
    if (entries.length === 0) {
      error('No subtitle entries parsed');
      return;
    }

    // Find video container
    let container = video.parentElement;
    let depth = 0;
    while (container && depth < 15) {
      const classes = container.className || '';
      const id = container.id || '';
      if (classes.includes('video') || classes.includes('player') ||
          id.includes('video') || id.includes('player')) {
        break;
      }
      container = container.parentElement;
      depth++;
    }

    if (!container) {
      container = document.body;
    }

    container.style.position = container.style.position || 'relative';

    // Create drag handle (always visible)
    dragHandle = createDragHandle(container);

    // Create overlay
    createOverlay(video, container, dragHandle);
    startVideoSync(video, entries);

    log('=== Dual Subtitles Ready ===');

    // Show test message
    overlay.style.display = 'block';
    overlay.querySelector('.ds-original').textContent = 'Dual Subtitles activated!';
    overlay.querySelector('.ds-translated').textContent = 'Kéo ≡ để di chuyển khung phụ đề';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 2000);

    preTranslateBatch(entries);

    isInitialized = true;
    log('=== Dual Subtitles Fully Initialized ===');
  }

  function cleanup() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    if (preTranslateQueue) {
      preTranslateQueue = null;
    }
    if (speakDebounceTimer) {
      clearTimeout(speakDebounceTimer);
      speakDebounceTimer = null;
    }
    resetTTSState();
    if (overlay && overlay.parentElement) {
      overlay.remove();
    }
    if (dragHandle && dragHandle.parentElement) {
      dragHandle.remove();
    }
    overlay = null;
    dragHandle = null;
    subtitleEntries = [];
    isInitialized = false;
    initRetryCount = 0;
  }

  // =====================
  // STARTUP
  // =====================
  let ttsEnabledViaInteraction = false;

  function enableTTS() {
    if (speechSynthesis && !ttsEnabledViaInteraction) {
      try {
        const testUtterance = new SpeechSynthesisUtterance('');
        testUtterance.volume = 0;
        speechSynthesis.speak(testUtterance);
        speechSynthesis.cancel();
        ttsEnabledViaInteraction = true;
        log('✓ TTS enabled via user interaction');
      } catch (e) {
        error('✗ Failed to enable TTS:', e);
      }
    } else {
      log('TTS already enabled or not available');
    }
  }

  function waitForUserInteraction() {
    const enableHandler = () => {
      enableTTS();
      document.removeEventListener('click', enableHandler);
      document.removeEventListener('keydown', enableHandler);
      document.removeEventListener('touchstart', enableHandler);
    };

    document.addEventListener('click', enableHandler);
    document.addEventListener('keydown', enableHandler);
    document.addEventListener('touchstart', enableHandler);

    log('Waiting for user interaction to enable TTS...');
  }

  waitForUserInteraction();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      log('DOMContentLoaded, waiting for video...');
      setTimeout(init, 500);
    });
  } else {
    log('Document ready, starting init...');
    setTimeout(init, 500);
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      log('URL changed, reinitializing...');
      cleanup();
      setTimeout(init, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      log('Received message:', request.type, request.data);

      switch (request.type) {
        case 'toggle-subtitle':
          subtitleEnabled = request.data.enabled;
          if (!subtitleEnabled) {
            overlay.style.display = 'none';
          }
          log('Subtitle:', subtitleEnabled ? 'ON' : 'OFF');
          sendResponse({ status: 'ok' });
          break;

        case 'toggle-original':
          showOriginal = request.data.enabled;
          log('Original subtitle:', showOriginal ? 'ON' : 'OFF');
          sendResponse({ status: 'ok' });
          break;

        case 'toggle-translated':
          showTranslated = request.data.enabled;
          if (!showTranslated) {
            stopSpeaking();
          }
          log('Translated subtitle:', showTranslated ? 'ON' : 'OFF');
          sendResponse({ status: 'ok' });
          break;

        case 'set-language':
          targetLanguage = request.data.language;
          log('Target language changed to:', targetLanguage);
          voiceIndex = null;
          loadVoices();
          sendResponse({ status: 'ok' });
          break;

        case 'toggle-translation':
          translationEnabled = request.data.enabled;
          if (!translationEnabled) {
            stopSpeaking();
          }
          log('Translation:', translationEnabled ? 'ON' : 'OFF');
          sendResponse({ status: 'ok' });
          break;

        case 'toggle-tts':
          ttsEnabled = request.data.enabled;
          if (!ttsEnabled) {
            stopSpeaking();
          } else {
            log('✓ TTS turned ON, resetting state');
            currentTextHash = '';
            videoPaused = false;
          }
          log('✓ TTS:', ttsEnabled ? 'ON' : 'OFF');
          sendResponse({ status: 'ok' });
          break;

        case 'toggle-mute':
          videoMuted = request.data.muted;
          if (videoElement) {
            videoElement.muted = videoMuted;
          }
          log('Video muted:', videoMuted);
          sendResponse({ status: 'ok' });
          break;

        case 'set-rate':
          ttsRate = request.data.rate;
          log('✓ TTS rate updated to:', ttsRate);
          sendResponse({ status: 'ok' });
          break;

        case 'set-pitch':
          ttsPitch = request.data.pitch;
          log('✓ TTS pitch updated to:', ttsPitch);
          sendResponse({ status: 'ok' });
          break;

        case 'set-voice':
          voiceIndex = request.data.voiceIndex;
          const voices = speechSynthesis.getVoices();
          const selectedVoice = voices[voiceIndex];
          log('✓ Voice index changed to:', voiceIndex, selectedVoice ? `(${selectedVoice.name})` : '');
          sendResponse({ status: 'ok' });
          break;

        case 'get-settings':
          sendResponse({
            subtitleEnabled,
            showOriginal,
            showTranslated,
            translationEnabled,
            targetLanguage,
            ttsEnabled,
            videoMuted,
            ttsRate,
            ttsPitch,
            voiceIndex
          });
          resetTTSState();
          break;

        default:
          cleanup();
          init();
          sendResponse({ status: 'ok' });
      }

      return true;
    });
  }

  window.addEventListener('beforeunload', cleanup);

  log('Dual Subtitles script loaded (Auto-start)');
})();
