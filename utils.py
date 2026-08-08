from pathlib import Path
from .constants import SUPPORTED_EXT

def getFilesFromDirectory(dirPath: str) -> list[Path]:
    path = Path(dirPath)

    if not path.exists() or not path.is_dir():
        raise ValueError("Invalid directory")

    files = []
    for f in path.iterdir():
        if f.is_file() and f.suffix in SUPPORTED_EXT :
            files.append(f)
    return sorted(files)  

