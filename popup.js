(function() {
  'use strict';

  const subtitleToggle = document.getElementById('subtitle-toggle');
  const translationToggle = document.getElementById('translation-toggle');
  const ttsToggle = document.getElementById('tts-toggle');
  const muteToggle = document.getElementById('mute-toggle');
  const rateSlider = document.getElementById('rate-slider');
  const pitchSlider = document.getElementById('pitch-slider');
  const rateValue = document.getElementById('rate-value');
  const pitchValue = document.getElementById('pitch-value');
  const status = document.getElementById('status');
  const refreshBtn = document.getElementById('refresh-btn');

  let subtitleEnabled = true;
  let translationEnabled = true;
  let ttsEnabled = true;
  let videoMuted = true;
  let ttsRate = 1.3;
  let ttsPitch = 1.0;

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

  translationToggle.addEventListener('click', () => {
    translationEnabled = !translationEnabled;
    updateToggleState(translationToggle, translationEnabled);
    sendMessage('toggle-translation', { enabled: translationEnabled });
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
    sendMessage('set-rate', { rate: ttsRate });
  });

  pitchSlider.addEventListener('input', (e) => {
    ttsPitch = parseFloat(e.target.value);
    pitchValue.textContent = ttsPitch.toFixed(1);
    sendMessage('set-pitch', { pitch: ttsPitch });
  });

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
        if (response.translationEnabled !== undefined) {
          translationEnabled = response.translationEnabled;
          updateToggleState(translationToggle, translationEnabled);
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
      }
    });
  });
})();
