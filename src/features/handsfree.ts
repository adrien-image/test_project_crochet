// Hands-free counting: headphone / watch / lock-screen media buttons, and
// voice commands in French and English.

export interface Commands {
  plus: () => void;
  minus: () => void;
  done: () => void;
  zero: () => void;
}

// ---- Media session ----

let audio: HTMLAudioElement | null = null;

function silentWav(seconds = 2, rate = 8000): Blob {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, str: string) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, 'data');
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return new Blob([buf], { type: 'audio/wav' });
}

export function mediaSupported(): boolean {
  return 'mediaSession' in navigator;
}

/** Must be called from a click: browsers need a gesture to start audio. */
export async function startMedia(cmd: Commands, title: string): Promise<void> {
  if (!mediaSupported()) return;
  if (!audio) {
    audio = new Audio(URL.createObjectURL(silentWav()));
    audio.loop = true;
  }
  await audio.play();
  const ms = navigator.mediaSession;
  const keepPlaying = () => void audio?.play().catch(() => {});
  ms.setActionHandler('play', () => {
    cmd.plus();
    keepPlaying();
  });
  ms.setActionHandler('pause', () => {
    cmd.plus();
    keepPlaying();
  });
  ms.setActionHandler('nexttrack', () => cmd.done());
  ms.setActionHandler('previoustrack', () => cmd.minus());
  for (const a of ['seekforward', 'seekbackward'] as MediaSessionAction[]) {
    try {
      ms.setActionHandler(a, a === 'seekforward' ? () => cmd.done() : () => cmd.minus());
    } catch {
      /* unsupported action */
    }
  }
  ms.playbackState = 'playing';
  updateMedia(title, '');
}

export function updateMedia(title: string, artist: string) {
  if (!mediaSupported() || !audio) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: 'Mon Crochet' });
}

export function stopMedia() {
  if (!audio) return;
  audio.pause();
  const ms = navigator.mediaSession;
  for (const a of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekforward', 'seekbackward'] as MediaSessionAction[]) {
    try {
      ms.setActionHandler(a, null);
    } catch {
      /* ignore */
    }
  }
  ms.playbackState = 'none';
}

// ---- Voice ----

interface SR extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function recognitionCtor(): (new () => SR) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function voiceSupported(): boolean {
  return !!recognitionCtor();
}

/** Maps a phrase to a command. */
export function voiceCommand(phrase: string): keyof Commands | undefined {
  const s = phrase.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(rang|tour|round|row)\s+(fini|termine|done|finished|complete)|\bsuivant\b|\bnext\b/.test(s)) return 'done';
  if (/\b(zero|remise a zero|reset)\b/.test(s)) return 'zero';
  if (/\b(moins|minus|retire|back)\b/.test(s)) return 'minus';
  if (/\b(maille|mailles|plus|stitch|stitches|un|one|add)\b/.test(s)) return 'plus';
  return undefined;
}

let rec: SR | null = null;
let wanted = false;

export function startVoice(cmd: Commands, lang: string, onHeard: (w: string) => void, onError: (e: string) => void) {
  const Ctor = recognitionCtor();
  if (!Ctor) return;
  wanted = true;
  rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (!res.isFinal) continue;
      const text = res[0].transcript.trim();
      onHeard(text);
      // "maille maille" counts twice.
      const parts = text.split(/\s+(?=maille|plus|stitch)/i);
      for (const part of parts) {
        const c = voiceCommand(part);
        if (c) cmd[c]();
      }
    }
  };
  rec.onend = () => {
    if (wanted) {
      try {
        rec?.start();
      } catch {
        /* already started */
      }
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      wanted = false;
      onError(e.error);
    }
  };
  rec.start();
}

export function stopVoice() {
  wanted = false;
  rec?.stop();
  rec = null;
}
