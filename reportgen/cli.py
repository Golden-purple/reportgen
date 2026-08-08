import sys
from pathlib import Path
from reportgen.runner import runDirectory
from reportgen.renderer import generateMarkdown
from reportgen.utils import writeReport
from reportgen.pdf import *

def main():
    if len(sys.argv) != 2:
        print("Usage: reportgen < directory/ >")
        sys.exit(1)

    inputPath = sys.argv[1]
    path = Path(inputPath)

    if not path.is_dir():
        print("Not a directory lil bro.")
        sys.exit(1)

    results = runDirectory(inputPath)

    markdownContent = generateMarkdown(results)

    mdPath = path / f"{path.name}.md"
    writeReport(markdownContent, str(mdPath))

    pdfPath = path / f"{path.name}.pdf"

    try:
        md2PDF(mdPath=mdPath, pdfPath=pdfPath)
    except PDFConversionError as e:
        print(e)

if __name__ == "__main__":
    main()