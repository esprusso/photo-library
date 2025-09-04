"""
Add featured column to categories table
"""

import sqlite3
import os
from pathlib import Path

def migrate():
    """Add featured column to categories table"""
    
    # Get database path from environment or use default
    db_url = os.getenv('DB_URL', 'sqlite:///./app.db')
    
    if db_url.startswith('postgresql://'):
        print("PostgreSQL migration not implemented - manually add column")
        print("Run: ALTER TABLE categories ADD COLUMN featured BOOLEAN DEFAULT FALSE;")
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
        # Check if column already exists
        cursor.execute("PRAGMA table_info(categories)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'featured' in columns:
            print("Column 'featured' already exists in categories table")
            return
        
        # Add the featured column
        cursor.execute("ALTER TABLE categories ADD COLUMN featured BOOLEAN DEFAULT FALSE")
        conn.commit()
        print("Successfully added 'featured' column to categories table")
        
    except Exception as e:
        print(f"Error adding featured column: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()