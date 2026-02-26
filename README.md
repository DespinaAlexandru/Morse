# Morse Code Trainer

A static Morse code web app suitable for GitHub Pages.

## Features

- Configurable training settings (WPM, frequency, volume, spacing, group size, character count)
- Lessons and custom character sets
- Pre-start text played but not shown
- Optional live character display (only played characters are shown)
- Transcription mode with on-screen keyboard and score at end
- Session history saved in browser localStorage with optional score

## Run locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`.
4. Select your default branch and `/ (root)` folder.
5. Save. GitHub Pages will publish the app.
