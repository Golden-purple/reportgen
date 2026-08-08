import sys
from pathlib import Path
from runner import runDirectory
from renderer import generateMarkdown
from utils import writeReport

def main():
    if len(sys.argv) != 2:
        print("Usage: reportgen <directory>")
        sys.exit(1)

    inputPath = sys.argv[1]
    path = Path(inputPath)

    if not path.is_dir():
        print("Not a directory lil bro.")
        sys.exit(1)

    results = runDirectory(inputPath)

    markdownContent = generateMarkdown(results)

    outputPath = Path(f"{path.name}.md")
    writeReport(markdownContent, str(path / outputPath))

if __name__ == "__main__":
    main()