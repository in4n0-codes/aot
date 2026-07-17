// Background music: loops through whatever tracks you drop into `public/music`.
// The project ships with NO audio — you add your own .mp3 files and list them
// in public/music/playlist.json (see public/music/README.txt). Playback starts
// on a user gesture (the deploy click) to satisfy browser autoplay rules.
let audioEl = null;
let list = [];
let idx = 0;
let started = false;
let muted = false;
let vol = 0.45;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function initMusic() {
  if (audioEl) return;
  audioEl = new Audio();
  audioEl.volume = vol;
  // Reshuffle every time the playlist wraps, so the loop doesn't repeat the
  // same order (and the same opening track) run after run.
  audioEl.addEventListener('ended', () => {
    idx += 1;
    if (idx >= list.length) { shuffle(list); idx = 0; }
    play();
  });
  try {
    const res = await fetch('music/playlist.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) list = shuffle(data.filter((s) => typeof s === 'string' && s.trim()));
    }
  } catch (e) { list = []; }
}

function play() {
  if (!audioEl || !list.length || muted) return;
  audioEl.src = 'music/' + encodeURIComponent(list[idx]);
  audioEl.play().catch(() => {}); // ignore autoplay rejections
}

// Kick off the playlist (call from a user gesture).
export function startMusic() {
  if (started || !list.length) return;
  started = true;
  idx = 0;
  play();
}

export function nextTrack() {
  if (!list.length) return;
  idx = (idx + 1) % list.length;
  play();
}

export function toggleMusic() {
  muted = !muted;
  if (!audioEl) return muted;
  if (muted) audioEl.pause();
  else if (started) audioEl.play().catch(() => {});
  else startMusic();
  return muted;
}

export function setMusicVolume(v) {
  vol = Math.max(0, Math.min(1, v));
  if (audioEl) audioEl.volume = vol;
}

export function hasTracks() { return list.length > 0; }

// Debug/testing hook — current playback state.
export function getMusicStatus() {
  return {
    list: list.slice(),
    idx,
    started,
    muted,
    src: audioEl ? audioEl.src : null,
    paused: audioEl ? audioEl.paused : null,
    currentTime: audioEl ? audioEl.currentTime : null,
    readyState: audioEl ? audioEl.readyState : null,
    error: audioEl && audioEl.error ? audioEl.error.message : null,
  };
}
