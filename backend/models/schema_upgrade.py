from typing import Set
from sqlalchemy.engine import Engine
from sqlalchemy import text


def ensure_schema(engine: Engine) -> None:
    """Ensure required columns exist on images and categories tables.
    Idempotent and safe for both PostgreSQL and SQLite.
    """
    image_cols = {
        "local_path": "VARCHAR(255)",
        "aspect_ratio": "DOUBLE PRECISION",
        "format": "VARCHAR(255)",
        "negative_prompt": "TEXT",
        "model_hash": "VARCHAR(255)",
        "seed": "VARCHAR(255)",
        "steps": "INTEGER",
        "cfg_scale": "DOUBLE PRECISION",
        "sampler": "VARCHAR(255)",
        "favorite": "BOOLEAN DEFAULT FALSE",
        "rating": "INTEGER DEFAULT 0",
        "modified_at": "TIMESTAMP",
        "indexed_at": "TIMESTAMP",
        "phash": "VARCHAR(512)",
    }
    purged_cols = {
        "file_hash": "VARCHAR(128)"
    }

    with engine.connect() as conn:
        dialect = engine.dialect.name

        if dialect == "postgresql":
            for col, typ in image_cols.items():
                try:
                    conn.execute(text(f"ALTER TABLE images ADD COLUMN IF NOT EXISTS {col} {typ}"))
                except Exception:
                    pass
            for col, typ in purged_cols.items():
                try:
                    conn.execute(text(f"ALTER TABLE purged_images ADD COLUMN IF NOT EXISTS {col} {typ}"))
                except Exception:
                    pass
            try:
                conn.execute(text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS featured_image_id INTEGER"))
                conn.execute(text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS featured_image_position TEXT"))
            except Exception:
                pass
            conn.commit()
        else:
            # SQLite: PRAGMA introspection and conditional ALTERs
            try:
                rows = conn.execute(text("PRAGMA table_info(images)")).fetchall()
                existing = {r[1] for r in rows}
                for col, typ in image_cols.items():
                    if col not in existing:
                        try:
                            conn.execute(text(f"ALTER TABLE images ADD COLUMN {col} {typ}"))
                        except Exception:
                            pass
                rows = conn.execute(text("PRAGMA table_info(purged_images)")).fetchall()
                existing_purged = {r[1] for r in rows}
                for col, typ in purged_cols.items():
                    if col not in existing_purged:
                        conn.execute(text(f"ALTER TABLE purged_images ADD COLUMN {col} {typ}"))
                # categories columns
                rows = conn.execute(text("PRAGMA table_info(categories)")).fetchall()
                existing_cat = {r[1] for r in rows}
                if 'featured_image_id' not in existing_cat:
                    conn.execute(text("ALTER TABLE categories ADD COLUMN featured_image_id INTEGER"))
                if 'featured_image_position' not in existing_cat:
                    conn.execute(text("ALTER TABLE categories ADD COLUMN featured_image_position TEXT"))
            except Exception:
                pass
            conn.commit()
