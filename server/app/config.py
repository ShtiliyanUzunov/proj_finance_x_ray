import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
load_dotenv(SERVER_DIR / ".env")

_data_dir = os.getenv("DATA_DIR", "./data")
DATA_DIR = (SERVER_DIR / _data_dir).resolve() if not Path(_data_dir).is_absolute() else Path(_data_dir)
DATA_DIR.mkdir(parents=True, exist_ok=True)

CLASSIFICATION_DIR = (SERVER_DIR.parent / "classification").resolve()
CLASSIFICATION_DIR.mkdir(parents=True, exist_ok=True)

MAPPERS_DIR = (SERVER_DIR.parent / "mappers").resolve()
MAPPERS_DIR.mkdir(parents=True, exist_ok=True)

# Irrevocable BGN→EUR peg locked by the ECB ahead of Bulgaria's 2026 eurozone
# entry: 1 EUR = 1.95583 BGN. Applied at parse time by mappers whose name ends
# with "-bgn" so all internal amounts stay in EUR. Tweak here if the official
# rate's representation ever needs more precision.
BGN_TO_EUR_RATE = 1 / 1.95583
