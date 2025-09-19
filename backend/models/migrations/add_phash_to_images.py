"""
Add perceptual hash (phash) column to images table.
"""

import os
import sqlite3
import psycopg2


def migrate():
    db_url = os.getenv('DB_URL', 'sqlite:///./app.db')

    if db_url.startswith('postgresql://'):
        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='images' AND column_name='phash'")
                if cur.fetchone():
                    print("Column 'phash' already exists on images")
                else:
                    cur.execute("ALTER TABLE images ADD COLUMN phash TEXT")
                    print("Added 'phash' column on images")
            conn.commit()
        finally:
            conn.close()
        return

    # SQLite
    if db_url.startswith('sqlite:///'):
        db_path = db_url.replace('sqlite:///', '')
    else:
        db_path = './app.db'

    if not os.path.exists(db_path):
        print(f"Database file not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(images)")
        cols = [r[1] for r in cur.fetchall()]
        if 'phash' in cols:
            print("Column 'phash' already exists on images")
        else:
            cur.execute("ALTER TABLE images ADD COLUMN phash TEXT")
            print("Added 'phash' column on images")
        conn.commit()
    finally:
        conn.close()


if __name__ == '__main__':
    migrate()

