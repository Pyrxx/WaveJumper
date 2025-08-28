import os
import sys
import logging
import traceback
import base64
import hashlib
import librosa
import audioread.ffdec
import numpy as np
import json
from mutagen.mp4 import MP4, MP4Cover

# Configure logging to write errors to update_db.err
logging.basicConfig(
    filename='update.err',
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Global exception handler to log uncaught exceptions
def global_exception_handler(exctype, value, tb):
    error_message = "".join(traceback.format_exception(exctype, value, tb))
    logging.error("Uncaught Exception:\n%s", error_message)

sys.excepthook = global_exception_handler

# Settings
music_folder = "music"
output_js = os.path.join(music_folder, "music.js")

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
    aro = audioread.ffdec.FFmpegAudioFile(audio_path)
    y, sr = librosa.load(aro, sr=None, mono=True)

    total_samples = len(y)
    samples_per_bin = total_samples // target_length
    waveform = []

    for i in range(target_length):
        start = i * samples_per_bin
        end = start + samples_per_bin
        bin_slice = y[start:end]
        peak = float(np.max(np.abs(bin_slice))) if len(bin_slice) > 0 else 0.0
        waveform.append(peak)

    # normalize
    max_peak = max(waveform) if waveform else 1.0
    waveform = [amp / max_peak for amp in waveform]

    # Serialize waveform list as JSON string
    waveform_json = json.dumps(waveform)

    return waveform_json

def extract_date_from_title(title):
    if not title:
        return None
    date_str = title[-12:].replace("(", "").replace(")", "")
    return date_str

def main():
    tracks = []

    # Collect filenames
    existing_files = [f for f in os.listdir(music_folder) if f.lower().endswith(".m4a")]

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
        title = title[:-13] if title else None

        tracks.append([
            filename,
            artist,
            title,
            date,
            genre,
            comment,
            waveform_json,
            cover_b64,
            file_hash
        ])

    # Sort by filename descending
    tracks.sort(key=lambda x: x[0], reverse=True)

    # Write to JS file
    with open(output_js, "w", encoding="utf-8") as f:
        f.write("const musicData = ")
        json.dump(tracks, f, indent=2, ensure_ascii=False)
        f.write(";\n\nexport default musicData;\n")

    print("music.js generated and sorted")

if __name__ == "__main__":
    main()
