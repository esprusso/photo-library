from typing import Set
from sqlalchemy.engine import Engine
from sqlalchemy import text


def ensure_schema(engine: Engine) -> None:
    """Ensure required columns exist on the images table.
    For users who previously ran the simplified schema, this upgrades in-place
    by adding missing columns. Safe to run repeatedly.
    """
    required_columns = {
        # name -> SQL type
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
    }

    with engine.connect() as conn:
        dialect = engine.dialect.name

        if dialect == "postgresql":
            # Use IF NOT EXISTS for each column (idempotent)
            for col, coltype in required_columns.items():
                ddl = text(f"ALTER TABLE images ADD COLUMN IF NOT EXISTS {col} {coltype}")
                try:
                    conn.execute(ddl)
                except Exception:
                    pass
            conn.commit()
        else:
            # For SQLite: introspect and add only missing columns
            rows = conn.execute(text("PRAGMA table_info(images)")).fetchall()
            existing = {r[1] for r in rows}
            for col, coltype in required_columns.items():
                if col not in existing:
                    try:
                        conn.execute(text(f"ALTER TABLE images ADD COLUMN {col} {coltype}"))
                    except Exception:
                        pass
            conn.commit()
