# Kartfall Audio Assets

Drop your game audio files in this folder to enable in-game sound.

## Enable audio

In `game_client/.env`, set:

```bash
VITE_ENABLE_AUDIO=true
```

## Required file names

The client auto-loads these keys (any one of `.ogg`, `.mp3`, or `.wav`):

- `music_match`
- `sfx_attack`
- `sfx_explosion`
- `sfx_hit`
- `sfx_pickup`
- `sfx_kill`
- `sfx_respawn`
- `sfx_countdown`

Example:

- `public/audio/music_match.ogg`
- `public/audio/sfx_explosion.wav`

## Notes

- If `VITE_ENABLE_AUDIO` is `false`, audio files are not loaded.
- The HUD mute button persists your preference in local storage.
- Keep SFX short (< 1s) and normalized to avoid clipping.
