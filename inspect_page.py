#!/usr/bin/env python3
"""
Selenium script to inspect DeepLearning.AI video player structure
"""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import json

def inspect_deeplearning_ai():
    # Setup Chrome options
    chrome_options = Options()
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    # chrome_options.add_argument('--headless')  # Don't use headless so we can see
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')

    driver = webdriver.Chrome(options=chrome_options)

    try:
        print("=== DeepLearning.AI Video Player Inspector ===\n")

        # Navigate to the page
        url = "https://learn.deeplearning.ai/courses/agent-skills-with-anthropic/lesson/bv2ekh/why-use-skills---part-i"
        print(f"Opening: {url}")
        driver.get(url)

        # Wait for page to load
        print("Waiting for page to load...")
        time.sleep(5)

        # Check for login requirement
        page_text = driver.find_element(By.TAG_NAME, "body").text
        if "Sign in" in page_text or "Log in" in page_text:
            print("\n" + "="*60)
            print("PAGE REQUIRES LOGIN!")
            print("="*60)
            print("\nThis page requires authentication to access the video.")
            print("We cannot proceed without login credentials.")
            print("\nHowever, I can still help you fix the extension.")
            print("Please provide the Console logs when you test it manually.\n")
            return

        # Wait for video player
        print("Looking for video elements...")
        time.sleep(3)

        # Execute JavaScript to inspect video player
        inspect_script = """
        function inspectVideoPlayer() {
            const result = {
                videos: [],
                iframes: [],
                textTracks: [],
                hasHLS: false,
                videoPlayerType: null
            };

            // Check for video elements
            const videos = document.querySelectorAll('video');
            videos.forEach((video, i) => {
                const trackInfo = [];
                if (video.textTracks) {
                    for (let j = 0; j < video.textTracks.length; j++) {
                        const track = video.textTracks[j];
                        trackInfo.push({
                            kind: track.kind,
                            label: track.label,
                            language: track.language,
                            mode: track.mode,
                            cuesCount: track.cues ? track.cues.length : 0
                        });
                    }
                }

                result.videos.push({
                    index: i,
                    src: video.src,
                    currentSrc: video.currentSrc,
                    readyState: video.readyState,
                    textTracks: trackInfo
                });

                // Check for HLS
                if (video.src && video.src.includes('.m3u8')) {
                    result.hasHLS = true;
                }
            });

            // Check for iframes
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach((iframe, i) => {
                result.iframes.push({
                    index: i,
                    src: iframe.src,
                    title: iframe.title
                });
            });

            // Detect player type
            if (document.querySelector('.video-js')) {
                result.videoPlayerType = 'Video.js';
            } else if (document.querySelector('.jwplayer')) {
                result.videoPlayerType = 'JWPlayer';
            } else if (document.querySelector('[data-video-js]')) {
                result.videoPlayerType = 'Video.js (attribute)';
            } else if (videos.length > 0) {
                result.videoPlayerType = 'HTML5 Video (native)';
            }

            return JSON.stringify(result, null, 2);
        }

        return inspectVideoPlayer();
        """

        result = driver.execute_script(inspect_script)
        data = json.loads(result)

        print("\n" + "="*60)
        print("INSPECTION RESULTS")
        print("="*60)

        print(f"\nVideo Player Type: {data.get('videoPlayerType', 'Unknown')}")
        print(f"Has HLS: {data.get('hasHLS', False)}")
        print(f"Number of videos: {len(data.get('videos', []))}")
        print(f"Number of iframes: {len(data.get('iframes', []))}")

        if data.get('videos'):
            print("\n--- Video Elements ---")
            for v in data['videos']:
                print(f"\nVideo #{v['index']}:")
                print(f"  src: {v.get('src', 'N/A')[:100] if v.get('src') else 'N/A'}")
                print(f"  currentSrc: {v.get('currentSrc', 'N/A')[:100] if v.get('currentSrc') else 'N/A'}")
                print(f"  readyState: {v.get('readyState', 'N/A')}")
                print(f"  Text tracks: {len(v.get('textTracks', []))}")

                for t in v.get('textTracks', []):
                    print(f"    - kind={t['kind']}, label={t.get('label', 'N/A')}, lang={t.get('language', 'N/A')}, mode={t['mode']}, cues={t['cuesCount']}")

        if data.get('iframes'):
            print("\n--- Iframe Elements ---")
            for iframe in data['iframes']:
                print(f"  Iframe #{iframe['index']}: src={iframe['src'][:80]}")

        # Check for subtitle elements in DOM
        subtitle_elements = driver.execute_script("""
        const subs = [];
        // Check for track elements
        const tracks = document.querySelectorAll('track');
        tracks.forEach((t, i) => {
            subs.push({
                type: 'track',
                kind: t.kind,
                label: t.label,
                srclang: t.srclang,
                src: t.src
            });
        });
        return JSON.stringify(subs);
        """)
        subs_data = json.loads(subtitle_elements)
        if subs_data:
            print("\n--- Track Elements ---")
            for s in subs_data:
                print(f"  {s}")

        print("\n" + "="*60)
        print("RECOMMENDATION")
        print("="*60)

        if data.get('hasHLS') or any('.m3u8' in v.get('currentSrc', '') for v in data.get('videos', [])):
            print("\n✓ Detected HLS video (.m3u8)")
            print("  → Need polling method for subtitle cues")
            print("  → TextTrack cues may load asynchronously")

        if data.get('videos') and any(v.get('textTracks') for v in data['videos']):
            tracks = [t for v in data['videos'] for t in v.get('textTracks', [])]
            if any(t.get('cuesCount', 0) > 0 for t in tracks):
                print("\n✓ Found pre-loaded cues")
                print("  → Can use oncuechange event directly")
            else:
                print("\n✓ No cues loaded yet")
                print("  → Need to wait for cues to load")
                print("  → Use polling or wait for 'load' event on TextTrack")

        print("\n" + "="*60)
        print("Keeping browser open for 30 seconds for manual inspection...")
        print("You can also check the Console in the browser DevTools.")
        print("="*60)

        # Keep browser open
        time.sleep(30)

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()

    finally:
        print("\nClosing browser...")
        driver.quit()

if __name__ == "__main__":
    inspect_deeplearning_ai()
