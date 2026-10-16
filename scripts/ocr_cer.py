"""Root launcher for services/ai/scripts/ocr_cer.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPT_PATH = ROOT_DIR / "services" / "ai" / "scripts" / "ocr_cer.py"

spec = importlib.util.spec_from_file_location("ai_ocr_cer", SCRIPT_PATH)
if spec and spec.loader:
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if __name__ == "__main__":
        module.main()
