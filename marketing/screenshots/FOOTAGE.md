# Footage

The video areas in the screenshots show still frames from stock clips on Mixkit. No other sources are used: nothing comes from TikTok, YouTube, Instagram or a personal channel.

**Licence:** Mixkit Stock Video Free License, https://mixkit.co/license/#videoFree. Each clip page below says "Mixkit Stock Video Free License". The licence allows commercial use, including marketing, and requires no attribution. It forbids reselling the unaltered items.

**Author:** Mixkit clip pages don't credit an individual author, so none is listed here.

**How the frames were made:** each clip was downloaded once at the resolution shown. `ffmpeg` then pulled one frame per timestamp at native resolution (`-ss T -frames:v 1`). Landscape clips were cropped to 9:16 at native resolution and scaled once to 1080 px wide with Lanczos, except clip 4834, which was kept at its native crop width of 608 px. Frames were saved as JPEG (about 80–170 KB each; 1080 px wide, or 608 px for 4834), and the video files were deleted. Total downloaded: about 250 MB, under the 300 MB limit. That counts the full clips (about 238 MB, including one repeat download of clip 4834), the 360p previews used to pick timestamps, and the listing thumbnails. The preview files were deleted too.

| Clip | Mixkit page | Downloaded | Crop | Frames in `footage/` |
|---|---|---|---|---|
| 34487 · "Blogging girl down the street with his cell" | https://mixkit.co/free-stock-video/blogging-girl-down-the-street-with-his-cell-34487/ | 1080 × 1920 | none | `mixkit-34487-1_8s.jpg`, `-4_2s`, `-6_0s`, `-8_2s` |
| 39813 · "Woman on a video call in outdoors" | https://mixkit.co/free-stock-video/woman-on-a-video-call-in-outdoors-39813/ | 1080 × 1920 | none | `mixkit-39813-0_5s.jpg`, `-3_2s`, `-7_0s`, `-8_3s` |
| 39814 · "Laughing girl talking on a video call" (same person as 39813) | https://mixkit.co/free-stock-video/laughing-girl-talking-on-a-video-call-39814/ | 1080 × 1920 | none | `mixkit-39814-3_0s.jpg`, `-5_5s`, `-6_5s` |
| 42323 · "Portrait of an influencer talking to the camera" | https://mixkit.co/free-stock-video/portrait-of-an-influencer-talking-to-the-camera-42323/ | 720 × 1280 | none | `mixkit-42323-2_5s.jpg`, `-12_6s` |
| 42319 · "Happy girl posing in front of the camera" | https://mixkit.co/free-stock-video/happy-girl-posing-in-front-of-the-camera-42319/ | 720 × 1280 | none | `mixkit-42319-4_9s.jpg`, `-7_7s` |
| 41290 · "Face of a vlogger speaking to the camera" | https://mixkit.co/free-stock-video/face-of-a-vlogger-speaking-to-the-camera-41290/ | 720 × 1280 | none | `mixkit-41290-2_0s.jpg` |
| 41272 · "Youtuber vlogging in his studio" | https://mixkit.co/free-stock-video/youtuber-vlogging-in-his-studio-41272/ | 1280 × 720 | 405 × 720 at x = 374 | `mixkit-41272-2_1s.jpg` |
| 10443 · "Teacher in online class" | https://mixkit.co/free-stock-video/teacher-in-online-class-10443/ | 1280 × 720 | 405 × 720 at x = 463 | `mixkit-10443-3_6s.jpg` |
| 2960 · "Bearded announcer, close up" | https://mixkit.co/free-stock-video/bearded-announcer-close-up-2960/ | 1280 × 720 | 405 × 720 at x = 430 | `mixkit-2960-4_2s.jpg` |

The file name gives the timestamp in seconds, for example `-4_2s` is 4.2 s. Frames from the 720p clips are kept at their native 720 px width (no upscaling). The 2026-09-29 refresh swapped the office-style clips (4834, 10457) for creator/UGC-style ones: people talking straight into a phone or camera.

## Where they appear

- **App** (`assets/onboarding/take01–10.jpg`, 360 × 640, the take wall on the hook, Ready and Create screens): 42323 @12.6, 42319 @4.9, 41290 @2.0, 34487 @1.8, 41272 @2.1, 39814 @3.0, 42319 @7.7, 10443 @3.6, 39813 @3.2, 2960 @4.2.
- **App onboarding video** (`assets/onboarding/demo.mp4`): 39813, see `assets/onboarding/VIDEO.md`.
- **Screenshot 03** (results): 34487 @1.8, 42319 @4.9, 42323 @12.6, 39813 @7.0. **04** (captions): 34487. **05** (timeline): 39813, 39814.
- **Screenshot 01 and the App Preview**: the 10 clips imported in the simulator are cut from these same Mixkit clips.
