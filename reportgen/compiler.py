from reportgen.extractor import *
from reportgen.models import ExecResult
import subprocess
import sys
from reportgen.constants import *

def runPyFile(filePath: Path) -> ExecResult:

    output = subprocess.run([sys.executable , str(filePath)] , capture_output=True , text=True)
    question = extractQuestion(filePath)
    code = extractCode(filePath)
    resultObj = ExecResult(str(filePath) , question , code , output.stdout , output.stderr , output.returncode)
    return resultObj

def buildCompileCmd(compiler: str, filePath: Path, exePath: Path, flags: list[str]) -> list[str]:
    return [compiler, str(filePath), *flags, "-o", str(exePath)]

def runCppFile(filePath: Path) -> ExecResult:
    exePath = filePath.with_suffix("")  

    cmd = buildCompileCmd("g++", filePath, exePath, CPP_FLAGS)

    compileProcess = subprocess.run(cmd , capture_output=True, text=True)

    if compileProcess.returncode != 0:
        return ExecResult( str(filePath), "" , "" , "", compileProcess.stderr, compileProcess.returncode)

    runProcess = subprocess.run( [str(exePath.resolve())], capture_output=True, text=True)

    question = extractQuestion(filePath)
    code = extractCode(filePath)

    return ExecResult( str(filePath), question , code , runProcess.stdout, runProcess.stderr, runProcess.returncode )

def runCFile(filePath: Path) -> ExecResult:
    exePath = filePath.with_suffix("")  

    cmd = buildCompileCmd("gcc", filePath, exePath, C_FLAGS)

    compileProcess = subprocess.run( cmd , capture_output=True, text=True)

    if compileProcess.returncode != 0:
        return ExecResult( str(filePath), "" , "" , "", compileProcess.stderr, compileProcess.returncode)

    runProcess = subprocess.run( [str(exePath.resolve())], capture_output=True, text=True)

    question = extractQuestion(filePath)
    code = extractCode(filePath=filePath)

    return ExecResult( str(filePath), question , code , runProcess.stdout, runProcess.stderr, runProcess.returncode )
