#!/bin/sh
# Synthesises the stress corpus (ffmpeg + `say`, nothing downloaded) into <dir>. Small files, low bitrates.
# Usage: stress-corpus.sh <dir> [--long]   (--long adds the two ~10-minute clips)
set -e
D="${1:?usage: stress-corpus.sh <dir> [--long]}"
mkdir -p "$D"
cd "$D"
FF="ffmpeg -hide_banner -loglevel error -y"

# Speech with pauses, fillers and a retake.
say -o speech.aiff "So today we are going to edit a video. [[slnc 1500]] Um, the first thing you do is open the app. \
Uh, [[slnc 800]] then you pick a clip. [[slnc 2000]] The first thing you do is, the first thing you do is open the app. \
Um, and that is it. [[slnc 1200]] Uh, thanks for watching, see you next time."
$FF -i speech.aiff -ar 48000 -ac 1 speech.wav

# Audio for a clip: speech looped/trimmed to $1 seconds at rate $2 and channels $3 -> $4
aud() { $FF -stream_loop -1 -i speech.wav -t "$1" -ar "$2" -ac "$3" -c:a pcm_s16le "$4"; }
# Picture: $1 WxH, $2 fps, $3 seconds, moving box over a dark field (cheap to encode).
pic() { echo "color=c=0x2a3550:s=$1:r=$2:d=$3,drawbox=x='mod(t*200,iw-200)':y=ih/3:w=200:h=260:color=0xf0c8b0:t=fill,drawbox=x=0:y=0:w=iw/5:h=ih/10:color=red:t=fill"; }
H264="-c:v libx264 -preset veryfast -pix_fmt yuv420p -b:v 1200k"
HEVC="-c:v libx265 -preset ultrafast -x265-params log-level=error -pix_fmt yuv420p -b:v 1200k -tag:v hvc1"
AAC="-c:a aac -b:a 96k"

v() { # name size fps secs ar ac codec-args [extra...]
  name=$1 size=$2 fps=$3 secs=$4 ar=$5 ac=$6 codec=$7; shift 7
  aud "$secs" "$ar" "$ac" _a.wav
  $FF -f lavfi -i "$(pic "$size" "$fps" "$secs")" -i _a.wav -shortest $codec $AAC "$@" "$name"
}

v portrait_1080x1920_30.mp4 1080x1920 30 8 48000 1 "$H264"
v landscape_1920x1080_30.mov 1920x1080 30 8 48000 2 "$H264"
v square_1080_30.mp4 1080x1080 30 6 44100 1 "$H264"
v portrait_24fps.mp4 1080x1920 24 6 48000 1 "$H264"
v portrait_60fps.mov 1080x1920 60 6 48000 1 "$H264"
v uhd_landscape_hevc.mov 3840x2160 30 3 48000 2 "$HEVC" -b:v 4M
v uhd_portrait_h264.mp4 2160x3840 30 3 48000 2 "$H264" -b:v 4M
v hevc_hvc1_portrait.mp4 1080x1920 30 6 48000 1 "$HEVC"
v mono_44k.mp4 1080x1920 30 5 44100 1 "$H264"
v stereo_48k.mov 1080x1920 30 5 48000 2 "$H264"
v stereo_44k.mp4 1080x1920 30 5 44100 2 "$H264"
v surround_51.mp4 1080x1920 30 4 48000 6 "$H264"
v short_1s.mp4 1080x1920 30 1 48000 1 "$H264"
v short_3s.mov 1080x1920 30 3 48000 1 "$H264"
v tiny_0.3s.mp4 1080x1920 30 0.3 48000 1 "$H264"
v odd_size_1078x1918.mp4 1078x1918 30 4 48000 1 "$H264"
v tiny_160x284.mp4 160x284 30 4 48000 1 "$H264" -b:v 100k
v speech_pauses_40s.mp4 720x1280 30 40 48000 1 "$H264" -b:v 400k
v start_offset_5s.mp4 1080x1920 30 5 48000 1 "$H264" -output_ts_offset 5

# HEVC tagged hev1 (ffmpeg's default tag, not what iPhones write).
aud 5 48000 1 _a.wav
$FF -f lavfi -i "$(pic 1080x1920 30 5)" -i _a.wav -shortest -c:v libx265 -preset ultrafast -x265-params log-level=error -b:v 1200k -tag:v hev1 $AAC hevc_hev1.mp4
# 10-bit HLG, tagged BT.2020 (like iPhone HDR).
$FF -f lavfi -i "$(pic 1080x1920 30 5)" -i _a.wav -shortest -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -tag:v hvc1 -b:v 1500k \
  -x265-params "log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc" \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc $AAC hdr_hlg_10bit.mov
# ProRes 422 Proxy, short.
$FF -f lavfi -i "$(pic 1080x1920 30 2)" -f lavfi -i "sine=f=220:d=2" -shortest -c:v prores_ks -profile:v 0 -c:a pcm_s16le prores_proxy.mov

# Rotation tags: stored landscape, displayed portrait (like an iPhone held upright), and 180/270.
aud 5 48000 1 _a.wav
$FF -f lavfi -i "$(pic 1920x1080 30 5)" -i _a.wav -shortest $H264 $AAC _r.mov
for r in 90 180 270; do
  # Input-side -display_rotation with stream copy writes the tag without rotating the pixels.
  $FF -display_rotation "$r" -i _r.mov -c copy "rot_$r.mov"
done

# Variable frame rate: drop frames irregularly, keep original timestamps.
$FF -f lavfi -i "$(pic 1080x1920 30 6)" -i _a.wav -shortest -vf "select='not(eq(mod(n,7),3))*not(eq(mod(n,11),5))'" -fps_mode vfr $H264 $AAC vfr.mp4

# Audio edge cases.
$FF -f lavfi -i "$(pic 1080x1920 30 5)" -an $H264 no_audio.mp4
$FF -f lavfi -i "$(pic 1080x1920 30 5)" -f lavfi -i "anullsrc=r=48000:cl=mono" -t 5 $H264 $AAC silent_audio.mp4
$FF -f lavfi -i "$(pic 1080x1920 30 3)" -i _a.wav $H264 $AAC video_shorter_than_audio.mp4
aud 2 48000 1 _b.wav
$FF -f lavfi -i "$(pic 1080x1920 30 5)" -i _b.wav $H264 $AAC audio_shorter_than_video.mp4

# Broken inputs.
: > zero_length.mp4
$FF -i _a.wav $AAC -f mp4 audio_only.mp4
head -c 300000 /dev/urandom > random_bytes.mov
$FF -f lavfi -i "$(pic 1080x1920 30 6)" -i _a.wav -shortest $H264 $AAC _full.mp4
sz=$(stat -f %z _full.mp4); head -c $((sz / 2)) _full.mp4 > truncated_moov_at_end.mp4
$FF -i _full.mp4 -c copy -movflags +faststart _fs.mp4
sz=$(stat -f %z _fs.mp4); head -c $((sz * 6 / 10)) _fs.mp4 > truncated_faststart.mp4

if [ "$2" = "--long" ]; then
  # ~10 minutes, low resolution, mostly flat picture, speech looped. 598 s passes the 600 s gate; 601 s must be refused.
  for s in 598 601; do
    aud $s 44100 1 _l.wav
    $FF -f lavfi -i "color=c=0x2a3550:s=360x640:r=30:d=$s,drawbox=x='mod(t*40,iw-60)':y=ih/3:w=60:h=80:color=0xf0c8b0:t=fill" -i _l.wav -shortest \
      -c:v libx264 -preset veryfast -pix_fmt yuv420p -b:v 80k -g 300 -c:a aac -b:a 32k "long_${s}s.mp4"
  done
fi
rm -f _*.wav _*.mp4 _*.mov speech.aiff
ls -la "$D"
