import subprocess
from pathlib import Path
from reportgen.constants import PDF_TIMEOUT_SECONDS


class PDFConversionError(Exception):
    pass

def md2PDF(mdPath: Path, pdfPath: Path):
    try:
        result = subprocess.run(
            ["pandoc", str(mdPath.resolve()), "-o", str(pdfPath.resolve()),
            "--pdf-engine=pdflatex", "--syntax-highlighting=pygments" ,
            ] ,
            capture_output=True, text=True, timeout=PDF_TIMEOUT_SECONDS
        )

        if result.returncode != 0:
            raise PDFConversionError(result.stderr)

    except subprocess.TimeoutExpired:
        raise PDFConversionError(f"PDF generation timed out after {PDF_TIMEOUT_SECONDS} seconds")
    except FileNotFoundError:
        raise PDFConversionError("Pandoc is not installed")