# Onboarding demo clip

`demo.mp4` and `demo-poster.jpg` play behind the overlays on the onboarding step "What Tenfold does for you" (`src/onboarding/Included.tsx`).

- **Source:** Mixkit clip 39813, "Woman on a video call in outdoors": https://mixkit.co/free-stock-video/woman-on-a-video-call-in-outdoors-39813/ (file downloaded: `https://assets.mixkit.co/videos/39813/39813-720.mp4`, 720 × 1280, 23.976 fps, 8.76 s).
- **Licence:** Mixkit Stock Video Free License, https://mixkit.co/license/#videoFree. Commercial use allowed, no attribution required, reselling the unaltered item not allowed. No author is credited on the clip page.
- **Edits (ffmpeg):** kept 0.5–7.7 s of the source, then cross-faded its last 0.5 s into the source's first 0.5 s, so the loop's end matches its start. Output: 7.22 s, 720 × 1280, H.264 High, yuv420p, CRF 24, no audio track, metadata stripped, `+faststart`, about 1.29 MB. `demo-poster.jpg` is the output's first frame at 720 × 1280 (about 47 KB), shown until the video's first frame renders and under Reduce Motion.
- The downloaded file was deleted after encoding. Nothing comes from TikTok, YouTube or Instagram.
