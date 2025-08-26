# update_db.py Summary

## Functionality
The `update_db.py` script processes M4A audio files in the "music" folder and updates an SQLite database (`music.db`) with metadata from these files. It:
- Calculates file hashes for each M4A file
- Extracts metadata (artist, title, genre, comment) and cover art
- Updates or inserts records in the database
- Deletes records for files no longer present in the folder
- Sorts tracks by filename

## Prerequisites
The script requires the following Python modules:
- `sqlite3` (included with Python standard library)
- `hashlib` (included with Python standard library)
- `base64` (included with Python standard library)
- `os` (included with Python standard library)
- `logging` (included with Python standard library)
- `mutagen.mp4` (external package)

## Installation
To install the required external module, run:
```bash
pip install mutagen
```