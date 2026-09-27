# Footage

The video areas in the screenshots show still frames from stock clips on Mixkit. No other sources are used: nothing comes from TikTok, YouTube, Instagram or a personal channel.

**Licence:** Mixkit Stock Video Free License, https://mixkit.co/license/#videoFree. Each clip page below says "Mixkit Stock Video Free License". The licence allows commercial use, including marketing, and requires no attribution. It forbids reselling the unaltered items.

**Author:** Mixkit clip pages don't credit an individual author, so none is listed here.

**How the frames were made:** each clip was downloaded once at the resolution shown. `ffmpeg` then pulled one frame per timestamp at native resolution (`-ss T -frames:v 1`). Landscape clips were cropped to 9:16 at native resolution and scaled once to 1080 px wide with Lanczos, except clip 4834, which was kept at its native crop width of 608 px. Frames were saved as JPEG (about 80–170 KB each; 1080 px wide, or 608 px for 4834), and the video files were deleted. Total downloaded: about 250 MB, under the 300 MB limit. That counts the full clips (about 238 MB, including one repeat download of clip 4834), the 360p previews used to pick timestamps, and the listing thumbnails. The preview files were deleted too.

| Clip | Mixkit page | Downloaded | Crop | Frames in `footage/` |
|---|---|---|---|---|
| 34487 · "Blogging girl down the street with his cell" | https://mixkit.co/free-stock-video/blogging-girl-down-the-street-with-his-cell-34487/ | 1080 × 1920 | none | `mixkit-34487-1_8s.jpg`, `-4_2s`, `-6_0s`, `-8_2s` |
| 10457 · "Guy facing in the middle of a video call on his computer" | https://mixkit.co/free-stock-video/guy-facing-in-the-middle-of-a-video-call-on-10457/ | 3840 × 2160 | 1215 × 2160 at x = 1160 | `mixkit-10457-4_8s.jpg`, `-9_2s` |
| 4834 · "Therapist in his office talking to the camera" | https://mixkit.co/free-stock-video/therapist-in-his-office-talking-to-the-camera-4834/ | 1920 × 1080 | 608 × 1080 at x = 656 | `mixkit-4834-1_5s.jpg`, `-6_0s`, `-12_0s` |
| 39813 · "Woman on a video call in outdoors" | https://mixkit.co/free-stock-video/woman-on-a-video-call-in-outdoors-39813/ | 1080 × 1920 | none | `mixkit-39813-0_5s.jpg`, `-3_2s`, `-7_0s`, `-8_3s` |
| 39814 · "Laughing girl talking on a video call" (same person as 39813, another take) | https://mixkit.co/free-stock-video/laughing-girl-talking-on-a-video-call-39814/ | 1080 × 1920 | none | `mixkit-39814-3_0s.jpg`, `-5_5s`, `-6_5s` |

The file name gives the timestamp in seconds, for example `-4_2s` is 4.2 s.

## Where each frame appears

| Image | Frames |
|---|---|
| 01 Batch results | 34487 @1.8, 10457 @4.8, 4834 @1.5, 39813 @7.0 |
| 02 Onboarding demo | 4834 @6.0 |
| 03 Captions | preview 34487 @4.2; timeline strip 34487 @1.8, 4.2, 6.0, 8.2 |
| 04 Timeline | preview 39814 @6.5; Clip 1 39813 @3.2, 7.0 · Clip 2 39814 @6.5, 5.5 · Clip 3 39813 @8.3, 0.5 |
| 05 Home | in-progress 10457 @9.2; Recent 34487 @8.2, 4834 @12.0, 39813 @0.5, 39814 @3.0 |

Frames were chosen with eyes open and faces toward the lens where the clip allows it. At full size, the frames show no legible brand logos or text. The phone on the gimbal (34487) is in a patterned case, and the laptops (4834, 10457) are closed and unbranded from these angles.
