(function() {
  'use strict';

  const subtitleToggle = document.getElementById('subtitle-toggle');
  const originalToggle = document.getElementById('original-toggle');
  const translatedToggle = document.getElementById('translated-toggle');
  const languageSelect = document.getElementById('language-select');
  const ttsToggle = document.getElementById('tts-toggle');
  const muteToggle = document.getElementById('mute-toggle');
  const rateSlider = document.getElementById('rate-slider');
  const pitchSlider = document.getElementById('pitch-slider');
  const rateValue = document.getElementById('rate-value');
  const pitchValue = document.getElementById('pitch-value');
  const voiceSelect = document.getElementById('voice-select');
  const status = document.getElementById('status');
  const refreshBtn = document.getElementById('refresh-btn');
  const presetButtons = document.querySelectorAll('.preset-btn');

  let subtitleEnabled = true;
  let showOriginal = false;
  let showTranslated = true;
  let targetLanguage = 'vi';
  let ttsEnabled = true;
  let videoMuted = true;
  let ttsRate = 1.5;
  let ttsPitch = 1.0;
  let selectedVoice = null;
  let availableVoices = [];

  const LANGUAGES = [
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'zh', name: '中文 (Trung Quốc)' },
    { code: 'ja', name: '日本語 (Nhật Bản)' },
    { code: 'ko', name: '한국어 (Hàn Quốc)' },
    { code: 'es', name: 'Español (Tây Ban Nha)' },
    { code: 'fr', name: 'Français (Pháp)' },
    { code: 'de', name: 'Deutsch (Đức)' },
    { code: 'it', name: 'Italiano (Ý)' },
    { code: 'pt', name: 'Português (Bồ Đào Nha)' },
    { code: 'ru', name: 'Русский (Nga)' },
    { code: 'ar', name: 'العربية (Ả Rập)' },
    { code: 'hi', name: 'हिन्दी (Hindi)' },
    { code: 'th', name: 'ไทย (Thái Lan)' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'ms', name: 'Bahasa Melayu' }
  ];

  const speechSynthesis = window.speechSynthesis;

  function sendMessage(type, data, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: type,
          data: data
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.log('Extension not active on this page');
            if (callback) callback(null);
          } else {
            if (callback) callback(response);
          }
        });
      }
    });
  }

  function updateToggleState(toggle, enabled) {
    if (enabled) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  function updateSliderValue(slider, valueElement, value) {
    slider.value = value;
    valueElement.textContent = value.toFixed(1);
  }

  subtitleToggle.addEventListener('click', () => {
    subtitleEnabled = !subtitleEnabled;
    updateToggleState(subtitleToggle, subtitleEnabled);
    sendMessage('toggle-subtitle', { enabled: subtitleEnabled });
  });

  originalToggle.addEventListener('click', () => {
    showOriginal = !showOriginal;
    updateToggleState(originalToggle, showOriginal);
    sendMessage('toggle-original', { enabled: showOriginal });
  });

  translatedToggle.addEventListener('click', () => {
    showTranslated = !showTranslated;
    updateToggleState(translatedToggle, showTranslated);
    sendMessage('toggle-translated', { enabled: showTranslated });
  });

  languageSelect.addEventListener('change', (e) => {
    targetLanguage = e.target.value;
    sendMessage('set-language', { language: targetLanguage });
    loadVoices();
  });

  ttsToggle.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    updateToggleState(ttsToggle, ttsEnabled);
    sendMessage('toggle-tts', { enabled: ttsEnabled });
  });

  muteToggle.addEventListener('click', () => {
    videoMuted = !videoMuted;
    updateToggleState(muteToggle, videoMuted);
    sendMessage('toggle-mute', { muted: videoMuted }, function(response) {
      if (response && response.status === 'ok') {
        console.log('Mute toggle confirmed:', videoMuted);
      }
    });
  });

  rateSlider.addEventListener('input', (e) => {
    ttsRate = parseFloat(e.target.value);
    rateValue.textContent = ttsRate.toFixed(1) + 'x';
    sendMessage('set-rate', { rate: ttsRate }, function(response) {
      if (response && response.status === 'ok') {
        console.log('Rate updated:', ttsRate);
      }
    });
  });

  voiceSelect.addEventListener('change', (e) => {
    const voiceIndex = e.target.value;
    if (voiceIndex && availableVoices[voiceIndex]) {
      selectedVoice = availableVoices[voiceIndex];
      sendMessage('set-voice', { voiceIndex: voiceIndex });
      console.log('Selected voice:', selectedVoice.name);
    }
  });

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      applyPreset(preset);
      setPresetActive(preset);
    });
  });

  function applyPreset(preset) {
    switch (preset) {
      case 'natural':
        ttsRate = 1.0;
        ttsPitch = 1.0;
        break;
      case 'fast':
        ttsRate = 1.3;
        ttsPitch = 1.1;
        break;
      case 'slow':
        ttsRate = 0.8;
        ttsPitch = 0.9;
        break;
    }
    rateSlider.value = ttsRate;
    rateValue.textContent = ttsRate.toFixed(1) + 'x';
    pitchSlider.value = ttsPitch;
    pitchValue.textContent = ttsPitch.toFixed(1);

    sendMessage('set-rate', { rate: ttsRate }, function(response) {
      if (response && response.status === 'ok') {
        console.log('Preset rate applied:', ttsRate);
      }
    });

    sendMessage('set-pitch', { pitch: ttsPitch }, function(response) {
      if (response && response.status === 'ok') {
        console.log('Preset pitch applied:', ttsPitch);
      }
    });
  }

  function loadVoices() {
    const synthesis = window.speechSynthesis;
    availableVoices = synthesis.getVoices();

    const langInfo = LANGUAGES.find(l => l.code === targetLanguage) || LANGUAGES[0];
    const languageVoices = availableVoices.filter(voice => voice.lang.startsWith(targetLanguage));

    console.log('Loaded voices:', availableVoices.length, `${langInfo.name}:`, languageVoices.length);

    voiceSelect.innerHTML = '';

    if (languageVoices.length === 0) {
      const option = document.createElement('option');
      option.textContent = `Không tìm thấy giọng ${langInfo.name}`;
      voiceSelect.appendChild(option);
    } else {
      languageVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = availableVoices.indexOf(voice);
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
      });
    }
  }

  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();

  function loadLanguages() {
    languageSelect.innerHTML = '';

    LANGUAGES.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      if (lang.code === targetLanguage) {
        option.selected = true;
      }
      languageSelect.appendChild(option);
    });
  }

  loadLanguages();

  refreshBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id);
        window.close();
      }
    });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const url = tabs[0]?.url || '';
    const isSupported = url.includes('coursera.org') || url.includes('deeplearning.ai');

    if (isSupported) {
      status.classList.remove('inactive');
      status.querySelector('.status-text').textContent = '✓ Đang hoạt động';
    } else {
      status.classList.add('inactive');
      status.querySelector('.status-text').textContent = '✗ Trang không được hỗ trợ';
    }

    sendMessage('get-settings', {}, function(response) {
      if (response) {
        if (response.subtitleEnabled !== undefined) {
          subtitleEnabled = response.subtitleEnabled;
          updateToggleState(subtitleToggle, subtitleEnabled);
        }
        if (response.showOriginal !== undefined) {
          showOriginal = response.showOriginal;
          updateToggleState(originalToggle, showOriginal);
        }
        if (response.showTranslated !== undefined) {
          showTranslated = response.showTranslated;
          updateToggleState(translatedToggle, showTranslated);
        }
        if (response.targetLanguage !== undefined) {
          targetLanguage = response.targetLanguage;
          languageSelect.value = targetLanguage;
          loadVoices();
        }
        if (response.ttsEnabled !== undefined) {
          ttsEnabled = response.ttsEnabled;
          updateToggleState(ttsToggle, ttsEnabled);
        }
        if (response.videoMuted !== undefined) {
          videoMuted = response.videoMuted;
          updateToggleState(muteToggle, videoMuted);
        }
        if (response.ttsRate !== undefined) {
          ttsRate = response.ttsRate;
          updateSliderValue(rateSlider, rateValue, ttsRate);
        }
        if (response.ttsPitch !== undefined) {
          ttsPitch = response.ttsPitch;
          updateSliderValue(pitchSlider, pitchValue, ttsPitch);
        }
        if (response.voiceIndex !== undefined) {
          voiceSelect.value = response.voiceIndex;
          selectedVoice = response.voiceIndex;
        }

        const preset = detectPreset(ttsRate, ttsPitch);
        if (preset) {
          setPresetActive(preset);
        }
      }
    });

  function detectPreset(rate, pitch) {
    const epsilon = 0.05;

    if (Math.abs(rate - 1.0) < epsilon && Math.abs(pitch - 1.0) < epsilon) {
      return 'natural';
    }
    if (Math.abs(rate - 1.3) < epsilon && Math.abs(pitch - 1.1) < epsilon) {
      return 'fast';
    }
    if (Math.abs(rate - 0.8) < epsilon && Math.abs(pitch - 0.9) < epsilon) {
      return 'slow';
    }
    return null;
  }
  });
})();
