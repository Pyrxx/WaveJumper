# update_db.py Summary

## Functionality
The `update_db.py` script processes M4A audio files in the "music" folder and updates an SQLite database (`music.db`) with metadata from these files. It:
- Calculates file hashes
- Generates waveform data
- Extracts metadata (artist, title, genre, comment) and cover art
- Extracts date from the last 12 characters of the title tag
- Deletes records for files no longer present in the folder
- Detects file changes and updates the corresponding record in the database
- Inserts records for new files in the database
- Sorts the database records in descending order by filename

## Prerequisites
The script requires the following external Python modules:
- `mutagen.mp4`
- `librosa`
- `numpy`
- `audioread.ffdec`

## Installation
To install the required external modules, run:
```bash
pip install mutagen librosa numpy
```

## System Requirements
- FFmpeg must be installed system-wide for waveform generation
