from pathlib import Path
from reportgen.constants import *

def getFilesFromDirectory(dirPath: str) -> list[Path]:
    path = Path(dirPath)

    if not path.exists() or not path.is_dir():
        raise ValueError("Invalid directory")

    files = []
    for f in path.iterdir():
        if f.is_file() and f.suffix in SUPPORTED_EXT :
            files.append(f)
    return sorted(files)  

def writeReport(content: str , fileName: str = "report.md"):
    with open(fileName, "w") as f:
        f.write(content)

