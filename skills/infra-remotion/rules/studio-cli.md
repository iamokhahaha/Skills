# Remotion Studio & CLI

## Starting Remotion Studio

**Important**: Do NOT specify the entry point on the command line if `remotion.config.ts` already sets it via `Config.setEntryPoint()`. Specifying it again causes the Studio to hang silently.

```bash
# CORRECT — let remotion.config.ts handle entry point
npx remotion studio --port=3000

# WRONG — causes silent hang when config already sets entry point
npx remotion studio src/index.ts --port=3000
```

### Startup flags

- `--no-open`: Don't auto-open browser (useful for background/scripted launches)
- `--port=XXXX`: Specify port (default: 3000)

### Typical startup time

- First build: 8-15 seconds
- Subsequent (with cache): 3-8 seconds
- If no output after 30s, likely hung — kill and retry

### Troubleshooting hangs

1. **Kill zombie processes**: Previous failed launches leave zombie Node processes
   ```bash
   ps aux | grep remotion | grep -v grep | awk '{print $2}' | xargs kill -9
   ```
2. **Clear cache**: `rm -rf node_modules/.cache`
3. **Don't duplicate entry point**: Check `remotion.config.ts` — if it has `Config.setEntryPoint()`, do NOT pass the entry file as a CLI argument

## Rendering Stills

```bash
npx remotion still --composition=SceneName --frame=200 --output=output.png
```

Requires Chrome/Chromium. If connection timeout occurs:
- Set `BROWSER_EXECUTABLE_PATH=/path/to/chromium`
- Or use `--browser-executable=/path/to/chromium`

## Theme Architecture

Centralize all visual constants in a shared `theme.ts`:

```typescript
// theme.ts — single source of truth
export const C = { /* colors */ };
export const F = { /* font sizes */ };
export const canvasStyle = { /* shared canvas wrapper */ };
export const fade = (frame, delay, dur) => { /* ... */ };
export const slideUp = (frame, delay, fps) => { /* ... */ };
export const entranceBlur = (frame, fps) => { /* ... */ };
export const subtleZoom = (frame, totalFrames) => { /* ... */ };
```

Benefits:
- Global font size adjustment in one place
- Consistent animation patterns across scenes
- Shared color palette prevents drift
