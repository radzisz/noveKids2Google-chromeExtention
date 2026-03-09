# NovaKid to Google Calendar

Chrome extension that syncs your NovaKid English lesson schedule to Google Calendar.

## Features

- Automatically detects lessons from the NovaKid schedule page
- Syncs lessons to Google Calendar with one click
- Auto-sync option (checks every 6 hours)
- Per-child calendar color selection
- Custom event prefix
- Supports 10 languages: English, Polish, German, Spanish, French, Turkish, Italian, Portuguese, Chinese, Japanese

## Installation (Development)

1. Clone the repository
2. Build the dev version:
   ```
   npm run build:dev
   ```
3. Open `chrome://extensions/` in Chrome
4. Enable "Developer mode"
5. Click "Load unpacked" and select the `dist/dev/` folder

## Build

Requires Node.js.

```bash
npm run build          # Build dev version (default)
npm run build:dev      # Build dev version (with extension key for stable ID)
npm run build:store    # Build store version (no key, creates zip)
npm run clean          # Remove dist/ directory
```

### Build targets

- **dev** — Copies source to `dist/dev/` with the manifest `key` field intact (keeps a stable extension ID for OAuth2 during development)
- **store** — Copies source to `dist/store/`, removes the `key` field from manifest, and creates `dist/novakid-gcal-ext.zip` ready for Chrome Web Store upload

## How it works

1. Navigate to your NovaKid schedule page
2. Click the extension icon — it scans for upcoming lessons
3. Connect your Google account and sync lessons to your calendar
4. Optionally enable auto-sync to keep your calendar up to date

## Privacy

The extension only accesses:
- NovaKid schedule page (to read lesson data)
- Google Calendar API (to create/update events)

No data is sent to any third-party servers. All processing happens locally in your browser.

## License

MIT
