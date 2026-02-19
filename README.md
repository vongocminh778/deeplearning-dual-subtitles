# 🎬 PolySub - Multi-Language Subtitles

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)](https://chrome.google.com/webstore)
[![Version](https://img.shields.io/badge/version-2.0.0-blue)](https://github.com/vongocminh/polysub/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Language](https://img.shields.io/badge/JavaScript-F7DF1E)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

> Professional Chrome extension for displaying bilingual subtitles with real-time translation and smart text-to-speech. Perfect for learning courses on DeepLearning.AI and Coursera.

## ✨ Key Features

### 🌍 Multi-Language Translation
- **15+ Languages Supported**: Vietnamese, Chinese, Japanese, Korean, Spanish, French, German, Italian, Portuguese, Russian, Arabic, Hindi, Thai, Indonesian, Malay
- **Real-time Translation**: Fast parallel batch translation using Google Translate API
- **Smart Caching**: Translations are cached for instant replay

### 🎯 Smart Subtitle Display
- **Flexible Layout**: Toggle original (English) and translated subtitles independently
- **Customizable Sizing**: Resize subtitle box from all 4 corners
- **Draggable Positioning**: Move subtitles anywhere on screen
- **Auto-hide**: Subtitles appear/disappear with video playback

### 🗣️ Advanced Text-to-Speech (TTS)
- **Smart Sync**: Automatically pauses video when TTS can't finish reading in time
- **Resume on Complete**: Video resumes when TTS finishes reading
- **Voice Selection**: Choose from available voices in your target language
- **Speed & Pitch Control**: Adjust reading speed (0.5x - 2.5x) and pitch (0.5 - 2.0)
- **Preset Modes**: Natural, Fast, or Slow reading presets
- **Default Speed**: 1.5x for optimal learning experience

### 🎨 User-Friendly Interface
- **Intuitive Controls**: Clean popup with all settings at your fingertips
- **Visual Feedback**: Status indicators show extension state
- **Touch Support**: Full support for mobile and touch devices
- **Easy Reset**: One-click reset to original position and size

## 📸 Screenshots

| Feature | Description |
|---------|-------------|
| **Main Interface** | Clean popup with all controls |
| **Subtitle Display** | Bilingual subtitles with customizable layout |
| **Resize & Drag** | Easy resize from 4 corners, drag anywhere |
| **Settings** | Language selection, TTS controls, and more |

## 🚀 Installation

### Option 1: Chrome Web Store (Recommended)
1. Visit [PolySub on Chrome Web Store](https://chrome.google.com/webstore) *(Coming Soon)*
2. Click "Add to Chrome"
3. Grant necessary permissions
4. Extension is ready to use!

### Option 2: Load Unpacked (Development)

```bash
# Clone the repository
git clone https://github.com/vongocminh/polysub.git
cd polysub

# Or download and extract the ZIP file
```

1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right corner)
3. Click **Load unpacked**
4. Select the `polysub` folder
5. Extension installed! ✅

## 📖 Quick Start Guide

### 1. Setup (First Time)
1. Open a course video on [DeepLearning.AI](https://learn.deeplearning.ai/) or [Coursera](https://www.coursera.org/)
2. Click the PolySub extension icon in your browser toolbar
3. Choose your preferred language for translation
4. Adjust TTS settings (speed, voice, etc.)
5. Enable/disable subtitles as needed

### 2. Using Subtitles
- **Auto-activation**: Extension activates automatically when video loads
- **Drag handle**: Look for `≡` handle to move subtitles
- **Resize handles**: Use 4 corner handles to resize the subtitle box
- **Reset**: Click `↺` button to reset position and size

### 3. Customizing Display
- **Toggle Original**: Show/hide English subtitles
- **Toggle Translated**: Show/hide translated subtitles
- **Smart Pause**: Auto-pause video during TTS reading
- **Mute Original**: Mute video audio while TTS is playing

## 🎯 How It Works

### Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PolySub Workflow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                               │
│  1. FETCH & PARSE                                           │
│  ├── Locate VTT subtitle file from video player                 │
│  ├── Download VTT content                                    │
│  └── Parse timestamps and text entries                         │
│                                                               │
│  2. PARALLEL TRANSLATION                                      │
│  ├── Pre-translate first 50 entries in batches of 5            │
│  ├── Check translation cache                                   │
│  ├── Translate new entries on-demand                           │
│  └── Cache results per language                               │
│                                                               │
│  3. VIDEO SYNC                                               │
│  ├── Monitor video playback time (100ms interval)              │
│  ├── Match current time with subtitle entries                   │
│  └── Display active subtitle                                   │
│                                                               │
│  4. TTS ENGINE                                               │
│  ├── Split text into segments (sentences/phrases)               │
│  ├── Calculate reading time vs subtitle duration                │
│  ├── Smart pause if TTS > remaining time                      │
│  ├── Read using browser's SpeechSynthesis API                 │
│  └── Resume video when TTS completes                         │
│                                                               │
│  5. USER INTERFACE                                           │
│  ├── Draggable overlay with 4-corner resize handles          │
│  ├── Popup settings panel                                     │
│  └── Message passing between popup and content scripts        │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Smart Sync Algorithm

The extension intelligently manages video playback during TTS:

1. **Calculate Required Time**: `tts_duration = word_count / (0.8 × tts_rate)`
2. **Check Available Time**: `available_time = (subtitle_end - video_current) × 1000`
3. **Decision Logic**:
   - If `tts_duration > available_time` → **Pause video**
   - If `tts_duration ≤ available_time` → **Keep playing**
4. **On Complete**: Resume video if it was auto-paused
5. **Position Sync**: Seek back if video drifted too far

## 🔧 Configuration

### Popup Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Show Subtitles** | Enable/disable subtitle display | ✅ On |
| **Show Original** | Show English (original) subtitles | ❌ Off |
| **Show Translated** | Show translated subtitles | ✅ On |
| **Translation Language** | Target language for translation | 🇻🇳 Vietnamese |
| **Text-to-Speech** | Enable/disable voice reading | ✅ On |
| **Smart Pause** | Auto-pause during TTS | ✅ On |
| **Mute Original** | Mute video audio | ✅ On |
| **TTS Speed** | Reading rate (0.5x - 2.5x) | 1.5x |
| **TTS Pitch** | Voice pitch (0.5 - 2.0) | 1.0 |
| **Voice Selection** | Choose specific voice | Auto |

### Advanced Configuration

Edit `js/content.js` to customize advanced settings:

```javascript
const CONFIG = {
  overlayBackground: 'rgba(0, 0, 0, 0.85)',  // Background color
  originalColor: '#ffd700',                 // Original text color (gold)
  translatedColor: '#ffffff',              // Translated text color (white)
  fontSize: '18px',                        // Font size
  syncInterval: 100,                       // Video sync check interval (ms)
  batchSize: 5,                            // Parallel translation batch size
  preTranslateCount: 50,                   // Number to pre-translate
  debug: true                              // Enable console logging
};
```

## 🌐 Supported Platforms

| Platform | URL | Status |
|----------|-----|--------|
| **DeepLearning.AI** | https://learn.deeplearning.ai/* | ✅ Fully Supported |
| **Coursera** | https://www.coursera.org/* | ✅ Fully Supported |

*More platforms coming soon!*

## 🛠️ Development

### Prerequisites

- **Google Chrome** (v88+)
- **Node.js** (optional, for build tools)
- **Basic knowledge** of JavaScript and Chrome Extension APIs

### Project Structure

```
polysub/
├── manifest.json          # Extension manifest (v3)
├── README.md              # This file
├── LICENSE                # MIT License
├── icon64.png            # Extension icon (64x64)
├── icon128.png           # Extension icon (128x128)
├── popup.html            # Settings popup UI
├── popup.js             # Popup logic
├── inspect_page.py       # Helper script for debugging
├── push.sh              # Deployment script
├── js/
│   ├── content.js        # Main content script (~1200 lines)
│   └── background.js    # Service worker
└── screenshots/         # Documentation screenshots
    ├── default.png
    └── dragged.png
```

### Building from Source

```bash
# Clone repository
git clone https://github.com/vongocminh/polysub.git
cd polysub

# No build process needed - it's vanilla JavaScript!

# Load in Chrome
1. Open chrome://extensions/
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select this folder
```

### Testing

1. Open a test video on DeepLearning.AI or Coursera
2. Open DevTools (F12) to see logs
3. Test all features: drag, resize, translate, TTS
4. Check console for errors
5. Test on different screen sizes (mobile support)

### Key APIs Used

- **Web Speech API** (`SpeechSynthesis`) - Text-to-speech
- **Fetch API** - Download VTT files
- **Chrome Extension APIs** - Messaging, storage, tabs
- **Google Translate API** - Translation service (unofficial)

## 🐛 Troubleshooting

### Subtitles Not Appearing

1. **Check CC is enabled**: Ensure subtitles are enabled on video player
2. **Verify language**: Make sure English subtitles are available
3. **Check console**: Open DevTools (F12) and look for errors
4. **Refresh page**: Reload the page and try again
5. **Check permissions**: Ensure extension has access to the website

### Translation Issues

1. **Check internet**: Requires internet connection for translation
2. **Cache clearing**: Clear translation cache if translations are incorrect
3. **Language support**: Verify target language is supported
4. **API rate limit**: Google Translate has rate limits, wait a bit

### TTS Not Working

1. **Browser support**: Ensure browser supports Web Speech API
2. **Voice availability**: Check if voices are available for selected language
3. **User interaction**: TTS may require user interaction first
4. **Check settings**: Verify TTS is enabled in popup

### Drag/Resize Not Working

1. **Check handle**: Click on the `≡` drag handle, not the overlay
2. **Avoid buttons**: Don't click on the reset `↺` button
3. **Check Z-index**: Ensure no other elements are blocking interaction
4. **Refresh page**: Reload if interactions are stuck

### Performance Issues

1. **Pre-translation**: Wait 10-20 seconds for pre-translation to complete
2. **Cache warming**: Subtitles will be faster on repeat viewings
3. **Reduce pre-translate count**: Edit CONFIG if memory is an issue

## 🤝 Contributing

We welcome contributions! Here's how to help:

### Reporting Issues

1. Check existing [issues](https://github.com/vongocminh/polysub/issues)
2. Create a new issue with:
   - Clear title
   - Platform (DeepLearning.AI/Coursera)
   - Browser version
   - Steps to reproduce
   - Expected vs actual behavior
   - Console errors (if any)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/AmazingFeature`
3. Make your changes
4. Test thoroughly
5. Commit: `git commit -m 'Add some AmazingFeature'`
6. Push: `git push origin feature/AmazingFeature`
7. Open Pull Request

### Code Style

- Use 2-space indentation
- Add comments for complex logic
- Follow existing code patterns
- Test on both DeepLearning.AI and Coursera
- Update documentation if needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### MIT License Summary

- ✅ Free to use
- ✅ Free to modify
- ✅ Free to distribute
- ✅ Commercial use allowed
- ✅ Must include license and copyright
- ❌ No warranty provided

## 🙏 Acknowledgments

- **Google Translate API** - Translation service
- **DeepLearning.AI** - Excellent AI courses
- **Coursera** - World-class learning platform
- **[coursera-dual-subtitles](https://github.com/nullcoke/coursera-dual-subtitles)** - Original inspiration
- **Chrome Extension Community** - Tools and documentation

## 📧 Support

### Getting Help

- 📖 **Documentation**: Check this README first
- 🐛 **Issues**: [Open an issue on GitHub](https://github.com/vongocminh/polysub/issues)
- 📧 **Email**: [vongocminh0609@example.com]
- 💬 **Discussions**: [Join GitHub Discussions](https://github.com/vongocminh/polysub/discussions)

### Feature Requests

We love hearing your ideas! Submit feature requests via:
- GitHub Issues with `[Feature Request]` tag
- Discussions section for brainstorming

## 🌟 Star History

If you find PolySub helpful, please consider giving it a star! ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=vongocminh/polysub&type=Date)](https://star-history.com/#vongocminh/polysub&Date)

## 📊 Roadmap

### Version 2.0 (Current)
- ✅ Multi-language support (15+ languages)
- ✅ Smart TTS sync with auto-pause
- ✅ 4-corner resize handles
- ✅ Independent subtitle toggles
- ✅ Enhanced UI/UX

### Version 2.1 (Planned)
- ⏳ Offline translation support
- ⏳ Custom vocabulary list
- ⏳ Export/import settings
- ⏳ Keyboard shortcuts

### Version 3.0 (Future)
- ⏳ More learning platforms (edX, Udemy, etc.)
- ⏳ AI-powered contextual translation
- ⏳ Speech-to-text for video
- ⏳ Study mode with quizzes

---

<div align="center">

**Made with ❤️ for learners worldwide**

[⬆ Back to Top](#-polysub---multi-language-subtitles)

</div>
