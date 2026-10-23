from reportgen.extractor import *
from reportgen.models import ExecResult
import subprocess
import sys
from reportgen.constants import *
import tempfile

def runPyFile(filePath: Path) -> ExecResult:
    question = extractQuestion(filePath)
    code = extractCode(filePath)

    try:
        output = subprocess.run([sys.executable, str(filePath)], capture_output=True, text=True, timeout=PROGRAM_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        return ExecResult(str(filePath), question, code, "", f"Execution timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)

    return ExecResult(str(filePath), question, code, output.stdout, output.stderr, output.returncode)

def buildCompileCmd(compiler: str, filePath: Path, exePath: Path, flags: list[str]) -> list[str]:
    return [compiler, str(filePath), *flags, "-o", str(exePath)]

def runCppFile(filePath: Path) -> ExecResult:
    question = extractQuestion(filePath)
    code = extractCode(filePath)

    with tempfile.TemporaryDirectory() as tmp:
        exePath = Path(tmp) / filePath.stem

        cmd = buildCompileCmd("g++", filePath, exePath, CPP_FLAGS)
        try:
            compileProcess = subprocess.run(cmd, capture_output=True, text=True, timeout=PROGRAM_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return ExecResult(str(filePath), question, code, "", f"Compilation timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)

        if compileProcess.returncode != 0:
            return ExecResult( str(filePath), "", "", "", compileProcess.stderr, compileProcess.returncode )

        try:
            runProcess = subprocess.run([str(exePath.resolve())], capture_output=True, text=True, timeout=PROGRAM_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return ExecResult(str(filePath), question, code, "", f"Execution timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)
        return ExecResult( str(filePath), question, code, runProcess.stdout, runProcess.stderr, runProcess.returncode )

def runCFile(filePath: Path) -> ExecResult:
    question = extractQuestion(filePath)
    code = extractCode(filePath)

    with tempfile.TemporaryDirectory() as tmp:
        exePath = Path(tmp) / filePath.stem
        cmd = buildCompileCmd("gcc", filePath, exePath, C_FLAGS)

        try:
            compileProcess = subprocess.run(cmd, capture_output=True, text=True, timeout=PROGRAM_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return ExecResult(str(filePath), question, code, "", f"Compilation timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)

        if compileProcess.returncode != 0:
            return ExecResult( str(filePath), "", "", "", compileProcess.stderr, compileProcess.returncode )

        try:
            runProcess = subprocess.run([str(exePath.resolve())], capture_output=True, text=True, timeout=PROGRAM_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return ExecResult(str(filePath), question, code, "", f"Execution timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)

        return ExecResult( str(filePath), question, code, runProcess.stdout, runProcess.stderr, runProcess.returncode )