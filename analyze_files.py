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
from io import BytesIO
from PIL import Image

# Configure logging to write errors to update_db.err
logging.basicConfig(
    filename='analyze_files.err',
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
output_js = "music.js"

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
        # Get bytes from MP4Cover or use bytes directly
        if isinstance(cover_data, MP4Cover):
            cover_bytes = cover_data
        else:
            cover_bytes = cover_data.tobytes()

        # Load image from bytes
        with Image.open(BytesIO(cover_bytes)) as img:
            width, height = img.size

            # Crop to 1:1 aspect ratio if needed
            if width != height:
                min_edge = min(width, height)
                left = (width - min_edge) // 2
                top = (height - min_edge) // 2
                right = left + min_edge
                bottom = top + min_edge
                img = img.crop((left, top, right, bottom))

            # Resize to 460x460
            img = img.resize((460, 460), Image.Resampling.LANCZOS)

            # Convert back to bytes (PNG format to preserve quality and transparency if any)
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            final_bytes = buffered.getvalue()

        # Encode to base64 and return string
        return base64.b64encode(final_bytes).decode("utf-8")

    return None

def compute_amplitudeData(audio_path, target_length=200):
    aro = audioread.ffdec.FFmpegAudioFile(audio_path)
    y, sr = librosa.load(aro, sr=None, mono=True)

    total_samples = len(y)
    samples_per_bin = total_samples // target_length
    amplitudeData = []

    for i in range(target_length):
        start = i * samples_per_bin
        end = start + samples_per_bin
        bin_slice = y[start:end]
        peak = float(np.max(np.abs(bin_slice))) if len(bin_slice) > 0 else 0.0
        amplitudeData.append(peak)

    # normalize
    max_peak = max(amplitudeData) if amplitudeData else 1.0
    amplitudeData = [amp / max_peak for amp in amplitudeData]

    # Serialize amplitudeData list as JSON string
    amplitudeData_json = json.dumps(amplitudeData)

    # Calculate duration in seconds
    duration = int(round(total_samples / sr))

    return amplitudeData_json, duration

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

        def wrap_comment_in_paragraphs(comment):
            if not comment:
                return comment
            # Split by line breaks, wrap each non-empty line in <p> tags, and join back with line breaks
            return "".join(f"<p>{line}</p>\n" for line in comment.split("\r\n") if line.strip())

        comment = wrap_comment_in_paragraphs(comment)
        amplitudeData_json, duration = compute_amplitudeData(filepath)
        cover_b64 = extract_cover_base64(tags)
        date = extract_date_from_title(title)
        title = title[:-13] if title else None

        tracks.append([
            filename,
            artist,
            title,
            date,
            genre,
            duration,
            comment,
            cover_b64,
            amplitudeData_json,
            file_hash
        ])

    # Sort by filename descending
    tracks.sort(key=lambda x: x[0], reverse=True)

    # Write to JS file
    # Reason for JS: it works serverless when site is accessed via file://
    with open(output_js, "w", encoding="utf-8") as f:
        f.write("const musicData = ")
        json.dump(tracks, f, indent=2, ensure_ascii=False)
        f.write(";\n")

    print("music.js generated and sorted")

if __name__ == "__main__":
    main()
