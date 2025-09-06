# analyze_music.py

## Functionality
- The script scans the target directory for audio files with a .m4a extension.
- For each file, it computes a SHA-256 hash to detect file changes.
- It uses the Mutagen library to extract metadata such as artist, title, genre, comments, and embedded cover art (which is cropped/resized to 1:1 aspect ratio at 512x512) from the audio file.
- It gets the duration and generates a normalized amplitudeData summary using librosa and audioread, representing the overall amplitude for waveform visualization purposes.
- It parses and removes a date from the track title based on naming conventions.
- The tracks are sorted by filename in descending order.
- Finally, it outputs all the track data as a JavaScript array and exports it to music.js for web or app consumption.

## Dependencies

### External Python modules

- `mutagen`
- `librosa`
- `numpy`
- `audioread`

To install them, run:
```bash
pip install mutagen librosa numpy
```

`audioread` is automatically installed when installing `librosa`. It is deprecated, but librosas default method `soundfile` cannot handle certain codecs yet.

### System Requirements
- FFmpeg must be installed system-wide for amplitudeData generation
