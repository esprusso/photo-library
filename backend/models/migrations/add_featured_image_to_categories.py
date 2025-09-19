"""
Add featured image fields to categories table
 - featured_image_id (INTEGER, references images.id)
 - featured_image_position (TEXT JSON for future positioning controls)
"""

import sqlite3
import os


def migrate():
    """Add featured image columns to categories table"""

    db_url = os.getenv('DB_URL', 'sqlite:///./app.db')

    if db_url.startswith('postgresql://'):
        print("PostgreSQL migration not implemented - manually add columns")
        print("Run: ALTER TABLE categories ADD COLUMN featured_image_id INTEGER;")
        print("Run: ALTER TABLE categories ADD COLUMN featured_image_position TEXT;")
        return

    # Handle SQLite
    if db_url.startswith('sqlite:///'):
        db_path = db_url.replace('sqlite:///', '')
    else:
        db_path = './app.db'

    if not os.path.exists(db_path):
        print(f"Database file not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check existing columns
        cursor.execute("PRAGMA table_info(categories)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'featured_image_id' not in columns:
            cursor.execute("ALTER TABLE categories ADD COLUMN featured_image_id INTEGER")
            print("Added 'featured_image_id' column to categories table")
        else:
            print("Column 'featured_image_id' already exists in categories table")

        if 'featured_image_position' not in columns:
            cursor.execute("ALTER TABLE categories ADD COLUMN featured_image_position TEXT")
            print("Added 'featured_image_position' column to categories table")
        else:
            print("Column 'featured_image_position' already exists in categories table")

        conn.commit()
    except Exception as e:
        print(f"Error adding featured image columns: {e}")
        conn.rollback()
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()

