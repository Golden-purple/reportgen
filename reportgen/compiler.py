from reportgen.extractor import *
from reportgen.models import ExecResult
import subprocess
import sys
from reportgen.constants import *
import tempfile

def readBounded(f) -> str:
    # The child left the shared file offset at the end; rewind before reading.
    f.seek(0)
    data = f.read(MAX_OUTPUT_BYTES + 1)
    truncated = len(data) > MAX_OUTPUT_BYTES
    text = data[:MAX_OUTPUT_BYTES].decode("utf-8", errors="backslashreplace")
    if truncated:
        text += f"\n\n[{TRUNCATION_MARKER}: only the first {MAX_OUTPUT_BYTES // 1024} KiB are shown]"
    return text

def runCaptured(cmd: list[str]) -> tuple[str, str, int]:
    # stdout/stderr go to temporary regular files, not pipes, so this process never
    # holds more than MAX_OUTPUT_BYTES (+1) per stream in memory.
    # Raises subprocess.TimeoutExpired unchanged; callers keep their own timeout messages.
    with tempfile.TemporaryFile() as outFile, tempfile.TemporaryFile() as errFile:
        process = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=outFile,
            stderr=errFile,
            timeout=PROGRAM_TIMEOUT_SECONDS,
        )
        return readBounded(outFile), readBounded(errFile), process.returncode

def runPyFile(filePath: Path) -> ExecResult:
    question = extractQuestion(filePath)
    code = extractCode(filePath)

    try:
        stdout, stderr, returncode = runCaptured([sys.executable, str(filePath)])
    except subprocess.TimeoutExpired:
        return ExecResult(str(filePath), question, code, "", f"Execution timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)

    return ExecResult(str(filePath), question, code, stdout, stderr, returncode)

def buildCompileCmd(compiler: str, filePath: Path, exePath: Path, flags: list[str]) -> list[str]:
    return [compiler, str(filePath), *flags, "-o", str(exePath)]

def runCppFile(filePath: Path) -> ExecResult:
    question = extractQuestion(filePath)
    code = extractCode(filePath)

    with tempfile.TemporaryDirectory() as tmp:
        exePath = Path(tmp) / filePath.stem

        cmd = buildCompileCmd("g++", filePath, exePath, CPP_FLAGS)
        try:
            compileOut, compileErr, compileCode = runCaptured(cmd)
        except subprocess.TimeoutExpired:
            return ExecResult(str(filePath), question, code, "", f"Compilation timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)

        if compileCode != 0:
            return ExecResult( str(filePath), "", "", "", compileErr, compileCode )

        try:
            runOut, runErr, runCode = runCaptured([str(exePath.resolve())])
        except subprocess.TimeoutExpired:
            return ExecResult(str(filePath), question, code, "", f"Execution timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)
        return ExecResult( str(filePath), question, code, runOut, runErr, runCode )

def runCFile(filePath: Path) -> ExecResult:
    question = extractQuestion(filePath)
    code = extractCode(filePath)

    with tempfile.TemporaryDirectory() as tmp:
        exePath = Path(tmp) / filePath.stem
        cmd = buildCompileCmd("gcc", filePath, exePath, C_FLAGS)

        try:
            compileOut, compileErr, compileCode = runCaptured(cmd)
        except subprocess.TimeoutExpired:
            return ExecResult(str(filePath), question, code, "", f"Compilation timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)

        if compileCode != 0:
            return ExecResult( str(filePath), "", "", "", compileErr, compileCode )

        try:
            runOut, runErr, runCode = runCaptured([str(exePath.resolve())])
        except subprocess.TimeoutExpired:
            return ExecResult(str(filePath), question, code, "", f"Execution timed out after {PROGRAM_TIMEOUT_SECONDS} seconds.", TIMEOUT_RETURN_CODE)

        return ExecResult( str(filePath), question, code, runOut, runErr, runCode )