from pathlib import Path
from runner import runDirectory, runFile
from renderer import generateMarkdown
from utils import *
import sys

def main():

    inputPath = sys.argv[1]
    path = Path(inputPath)

    if path.is_dir():
        results = runDirectory(inputPath)
    else:
        results = [runFile(path)]

    md = generateMarkdown(results)

    writeReport(md, fileName=str(path.with_suffix(".md")))