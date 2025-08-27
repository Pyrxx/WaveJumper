import os
import sys
import logging
import traceback
import base64
import sqlite3
import hashlib
import librosa
import audioread.ffdec
import numpy as np
import json
from mutagen.mp4 import MP4, MP4Cover

# Configure logging to write errors to error.log with timestamp and error level
logging.basicConfig(
    filename='update_db.err',
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Global exception handler to log uncaught exceptions
def global_exception_handler(exctype, value, tb):
    error_message = "".join(traceback.format_exception(exctype, value, tb))
    logging.error("Uncaught Exception:\n%s", error_message)

# Set the global exception handler
sys.excepthook = global_exception_handler

music_folder = "music"
db_path = "music.db"

def calculate_file_hash(filepath):
    hash_func = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            hash_func.update(chunk)
    return hash_func.hexdigest()

def extract_cover_base64(tags):
    covers = tags.get("covr")
    if covers:
        cover_data = covers[0]
        if isinstance(cover_data, MP4Cover):
            cover_bytes = cover_data
        else:
            cover_bytes = cover_data.tobytes()
        return base64.b64encode(cover_bytes).decode("utf-8")
    return None

def compute_waveform(audio_path, target_length=1000):
    # Force Audioread to use the ffmpeg backend, although it is deprecated
    # The default method SoundFile doesn't work with specific encoders
    aro = audioread.ffdec.FFmpegAudioFile(audio_path)
    y, sr = librosa.load(aro, sr=None, mono=True)

    # Absolute amplitude envelope (waveform) calculation
    # Aggregate audio samples into 'target_length' bins
    total_samples = len(y)
    samples_per_bin = total_samples // target_length

    waveform = []
    for i in range(target_length):
        start = i * samples_per_bin
        end = start + samples_per_bin
        bin_slice = y[start:end]
        peak = float(np.max(np.abs(bin_slice))) if len(bin_slice) > 0 else 0.0
        waveform.append(peak)

    # Normalize waveform to max 1.0
    max_peak = max(waveform) if waveform else 1.0
    waveform = [amp / max_peak for amp in waveform]

    # Serialize waveform list as JSON string
    waveform_json = json.dumps(waveform)

    return waveform_json

def extract_date_from_title(title):
    if not title:
        return None

    # Get the last 12 characters, remove parentheses
    date_str = title[-12:].replace("(", "").replace(")", "")
    return date_str

def connect_db():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tracks (
        filename TEXT UNIQUE,
        artist TEXT,
        title TEXT,
        date TEXT,
        genre TEXT,
        comment TEXT,
        waveform_json TEXT,
        cover_base64 TEXT,
        file_hash TEXT
    )
    """)
    conn.commit()
    return conn, cursor

def get_db_files(cursor):
    cursor.execute("SELECT filename, file_hash FROM tracks")
    return dict(cursor.fetchall())

def delete_files_not_in_directory(cursor, conn, existing_files):
    # delete database entries for non existent files
    cursor.execute("SELECT filename FROM tracks")
    db_files = set(row[0] for row in cursor.fetchall())
    to_delete = db_files - existing_files
    for filename in to_delete:
        cursor.execute("DELETE FROM tracks WHERE filename = ?", (filename,))
    conn.commit()

def update_or_insert_file(cursor, conn, filename, artist, title, date, genre, comment, waveform_json, cover_b64, file_hash):
    # check if file already in database and skip
    cursor.execute("SELECT file_hash FROM tracks WHERE filename = ?", (filename,))
    row = cursor.fetchone()
    if row:
        if row[0] == file_hash:
            # skip
            return
        else:
            # update
            cursor.execute("""
            UPDATE tracks SET artist=?, title=?, genre=?, comment=?, waveform_json=?, cover_base64=?, file_hash=?, date=?
            WHERE filename=?
            """, (artist, title, genre, comment, waveform_json, cover_b64, file_hash, date, filename))
    else:
        # insert
        cursor.execute("""
        INSERT INTO tracks (filename, artist, title, genre, comment, waveform_json, cover_base64, file_hash, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (filename, artist, title, genre, comment, waveform_json, cover_b64, file_hash, date))
    conn.commit()

def main():
    conn, cursor = connect_db()

    # read files and hashes
    existing_files = set()
    for filename in os.listdir(music_folder):
        if filename.lower().endswith(".m4a"):
            existing_files.add(filename)

    # delete files not in directory
    delete_files_not_in_directory(cursor, conn, existing_files)

    # process all actual files if they are new or has changed
    for filename in existing_files:
        filepath = os.path.join(music_folder, filename)
        file_hash = calculate_file_hash(filepath)
        if file_hash is None:
            continue

        audio = MP4(filepath)
        tags = audio.tags

        artist = tags.get("\xa9ART", [None])[0]
        title = tags.get("\xa9nam", [None])[0]
        genre = tags.get("\xa9gen", [None])[0]
        comment = tags.get("\xa9cmt", [None])[0]
        waveform_json = compute_waveform(filepath)
        cover_b64 = extract_cover_base64(tags)
        date = extract_date_from_title(title)
        title = title[:-13]

        update_or_insert_file(cursor, conn, filename, artist, title, date, genre, comment, waveform_json, cover_b64, file_hash)

    # sort by filename
    cursor.execute("CREATE TABLE IF NOT EXISTS sorted_tracks AS SELECT * FROM tracks ORDER BY filename")
    cursor.execute("DROP TABLE tracks")
    cursor.execute("ALTER TABLE sorted_tracks RENAME TO tracks")
    conn.commit()

    conn.close()
    print("database updated and sorted")

if __name__ == "__main__":
    main()
