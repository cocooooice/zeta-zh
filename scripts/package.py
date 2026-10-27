"""Package only distributable extension files, never settings or research data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "extension/manifest.json").read_text())["version"]
out = root / "dist" / f"zeta-zh-{version}.zip"
out.parent.mkdir(exist_ok=True)
with ZipFile(out, "w", ZIP_DEFLATED) as archive:
    for file in sorted((root / "extension").iterdir()):
        if file.is_file():
            archive.write(file, file.name)
print(out)
