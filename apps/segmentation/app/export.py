"""Write openapi.json for frontend client generation: `python -c "from app.export import main; main()"`."""

import json
from pathlib import Path

from app.main import app


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "openapi.json"
    out.write_text(json.dumps(app.openapi(), indent=2) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
