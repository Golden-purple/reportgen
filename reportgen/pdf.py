import subprocess
from pathlib import Path


class PDFConversionError(Exception):
    pass

def md2PDF(mdPath: Path, pdfPath: Path):
    try:
        result = subprocess.run(
            ["pandoc", str(mdPath.resolve()), "-o", str(pdfPath.resolve()),
            "--pdf-engine=pdflatex", "--syntax-highlighting=pygments" ,
            ] ,
            capture_output=True, text=True
        )

        if result.returncode != 0:
            raise PDFConversionError(result.stderr)

    except FileNotFoundError:
        raise PDFConversionError("Pandoc is not installed")