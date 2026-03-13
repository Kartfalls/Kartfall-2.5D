export const AUDIO_STORAGE_KEY = "kartfall_audio_settings";

export const AUDIO_KEYS = {
  MUSIC_MATCH: "music_match",
  SFX_ATTACK: "sfx_attack",
  SFX_EXPLOSION: "sfx_explosion",
  SFX_HIT: "sfx_hit",
  SFX_PICKUP: "sfx_pickup",
  SFX_KILL: "sfx_kill",
  SFX_RESPAWN: "sfx_respawn",
  SFX_COUNTDOWN: "sfx_countdown",
} as const;

export type AudioKey = (typeof AUDIO_KEYS)[keyof typeof AUDIO_KEYS];

export interface AudioSettings {
  muted: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  masterVolume: 0.8,
  musicVolume: 0.45,
  sfxVolume: 0.9,
};

export interface AudioAsset {
  key: AudioKey;
  sources: string[];
}

const AUDIO_FILE_BASENAMES: Record<AudioKey, string> = {
  [AUDIO_KEYS.MUSIC_MATCH]: "music_match",
  [AUDIO_KEYS.SFX_ATTACK]: "sfx_attack",
  [AUDIO_KEYS.SFX_EXPLOSION]: "sfx_explosion",
  [AUDIO_KEYS.SFX_HIT]: "sfx_hit",
  [AUDIO_KEYS.SFX_PICKUP]: "sfx_pickup",
  [AUDIO_KEYS.SFX_KILL]: "sfx_kill",
  [AUDIO_KEYS.SFX_RESPAWN]: "sfx_respawn",
  [AUDIO_KEYS.SFX_COUNTDOWN]: "sfx_countdown",
};

function buildAudioSources(baseName: string): string[] {
  return [
    `audio/${baseName}.ogg`,
    `audio/${baseName}.mp3`,
    `audio/${baseName}.wav`,
  ];
}

export const AUDIO_ASSETS: AudioAsset[] = Object.values(AUDIO_KEYS).map(
  (key) => ({
    key,
    sources: buildAudioSources(AUDIO_FILE_BASENAMES[key]),
  }),
);

export function isAudioEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_AUDIO || "false").toLowerCase() === "true";
}

export function readAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      muted: parsed.muted ?? DEFAULT_AUDIO_SETTINGS.muted,
      masterVolume: clamp01(parsed.masterVolume ?? DEFAULT_AUDIO_SETTINGS.masterVolume),
      musicVolume: clamp01(parsed.musicVolume ?? DEFAULT_AUDIO_SETTINGS.musicVolume),
      sfxVolume: clamp01(parsed.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume),
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function writeAudioSettings(
  patch: Partial<AudioSettings>,
): AudioSettings {
  const merged = {
    ...readAudioSettings(),
    ...patch,
  };

  const normalized: AudioSettings = {
    muted: !!merged.muted,
    masterVolume: clamp01(merged.masterVolume),
    musicVolume: clamp01(merged.musicVolume),
    sfxVolume: clamp01(merged.sfxVolume),
  };

  localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
