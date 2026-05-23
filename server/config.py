import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent
load_dotenv(SERVER_DIR / ".env")

_data_dir = os.getenv("DATA_DIR", "./data")
DATA_DIR = (SERVER_DIR / _data_dir).resolve() if not Path(_data_dir).is_absolute() else Path(_data_dir)
DATA_DIR.mkdir(parents=True, exist_ok=True)
