# WaveJumper (WIP)

A web-based music player with interactive waveform visualization. This project allows you to play audio tracks with visual waveforms that react to playback progress and user interactions.

## Features

- Interactive waveform visualization with color-coded play progress and hover effects
- Play, pause, previous, next track controls with keyboard shortcuts (spacebar, arrow keys)
- Volume control with mute functionality (M key or Numpad0 for mute)
- Responsive design that adapts to container size changes
- Track information display (artist, title, genre, date, duration, play time)
- Interactive waveform seeking by clicking on the visualization
- Playback progress updates with automatic next track playback

## Project Structure

```
.
├── music/               # Directory containing M4A audio files
├── index.html           # Main HTML file
├── styles.css           # CSS styles
├── scripts.js           # JavaScript for UI and playback controls
├── music.js             # Generated JS file with track data (created by update.py)
└── update.py            # Python script to process audio files and generate music.js
```

## Setup Instructions

### Prerequisites

- Python 3.x with required libraries:
  - librosa
  - numpy
  - Pillow (PIL)
  - mutagen
  - audioread

### Installing Dependencies

Run the following command to install the required Python packages:

```bash
pip install librosa numpy pillow mutagen
```

### Generating Track Data

Place your M4A audio files in the `music/` directory. Then run the update script:

```bash
python update.py
```

This will generate a `music.js` file containing metadata and amplitude data for all tracks in the music folder.

### Running the Player

Open `index.html` in your web browser to launch the player interface.

## How It Works

1. The Python script (`update.py`) processes audio files, extracts metadata, calculates waveform amplitude data, and generates a JavaScript file (`music.js`) containing this information.
2. The HTML file (`index.html`) sets up the page structure and includes references to CSS and JS files.
3. The CSS file (`styles.css`) styles the UI components and supports dark mode.
4. The JavaScript file (`scripts.js`) handles all interactive functionality:
   - Creates UI elements for each track
   - Draws waveform visualizations
   - Manages playback controls (play, pause, next, previous)
   - Updates UI based on playback progress
   - Handles user interactions like clicking the waveform to seek
