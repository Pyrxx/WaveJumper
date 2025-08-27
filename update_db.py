import os
import base64
import sqlite3
import hashlib
import logging
from mutagen.mp4 import MP4, MP4Cover

# Setup logging
logging.basicConfig(
    filename='update_db.err',
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

music_folder = "music"
db_path = "music.db"

def calculate_file_hash(filepath):
    try:
        hash_func = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(8192):
                hash_func.update(chunk)
        return hash_func.hexdigest()
    except Exception as e:
        logging.error(f"Error calculating file hash for {filepath}: {e}")
        return None

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
        cover_base64 TEXT,
        file_hash TEXT
    )
    """)
    conn.commit()
    return conn, cursor

def get_db_files(cursor):
    try:
        cursor.execute("SELECT filename, file_hash FROM tracks")
        return dict(cursor.fetchall())
    except Exception as e:
        logging.error(f"Error retrieving files from database: {e}")
        return {}

def delete_files_not_in_directory(cursor, conn, existing_files):
    try:
        # delete database entries for non existent files
        cursor.execute("SELECT filename FROM tracks")
        db_files = set(row[0] for row in cursor.fetchall())
        to_delete = db_files - existing_files
        for filename in to_delete:
            cursor.execute("DELETE FROM tracks WHERE filename = ?", (filename,))
        conn.commit()
    except Exception as e:
        logging.error(f"Error deleting files not in directory: {e}")
        conn.rollback()

def update_or_insert_file(cursor, conn, filename, artist, title, date, genre, comment, cover_b64, file_hash):
    try:
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
                UPDATE tracks SET artist=?, title=?, genre=?, comment=?, cover_base64=?, file_hash=?, date=?
                WHERE filename=?
                """, (artist, title, genre, comment, cover_b64, file_hash, date, filename))
        else:
            # insert
            cursor.execute("""
            INSERT INTO tracks (filename, artist, title, genre, comment, cover_base64, file_hash, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (filename, artist, title, genre, comment, cover_b64, file_hash, date))
        conn.commit()
    except Exception as e:
        logging.error(f"Error updating/inserting file {filename}: {e}")
        conn.rollback()

def main():
    try:
        conn, cursor = connect_db()

        # read files and hashes
        existing_files = set()
        for filename in os.listdir(music_folder):
            if filename.lower().endswith(".m4a"):
                existing_files.add(filename)

        # delete files not in directory
        delete_files_not_in_directory(cursor, conn, existing_files)

        # process all actual files
        for filename in existing_files:
            filepath = os.path.join(music_folder, filename)
            file_hash = calculate_file_hash(filepath)
            if file_hash is None:
                logging.error(f"Skipping {filename} due to hash calculation error")
                continue

            try:
                audio = MP4(filepath)
                tags = audio.tags

                artist = tags.get("\xa9ART", [None])[0]
                title = tags.get("\xa9nam", [None])[0]
                genre = tags.get("\xa9gen", [None])[0]
                comment = tags.get("\xa9cmt", [None])[0]
                cover_b64 = extract_cover_base64(tags)
                date = extract_date_from_title(title)
                title = title[:-13]

                update_or_insert_file(cursor, conn, filename, artist, title, date, genre, comment, cover_b64, file_hash)
            except Exception as e:
                logging.error(f"Error processing {filename}: {e}")

        # sort by filename
        try:
            cursor.execute("CREATE TABLE IF NOT EXISTS sorted_tracks AS SELECT * FROM tracks ORDER BY filename")
            cursor.execute("DROP TABLE tracks")
            cursor.execute("ALTER TABLE sorted_tracks RENAME TO tracks")
            conn.commit()
        except Exception as e:
            logging.error(f"Error sorting database: {e}")

        conn.close()
        print("database updated and sorted")
    except Exception as e:
        logging.error(f"Critical error in main function: {e}")

if __name__ == "__main__":
    main()
