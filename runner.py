from models import ExecResult
from utils import *
from compiler import *

def runFile(filePath: Path) -> ExecResult:
    suffix = filePath.suffix

    map = {
        ".py" : runPyFile,
        ".cpp" : runCppFile, 
        ".c" : runCFile
    }

    runFunction = map[suffix]
    if(runFunction != None) :
        return runFunction(filePath)
    else :
        return ExecResult(str(filePath), "" , "" , "", f"Unsupported file type: {suffix}", -1)

def runDirectory(dirPath: str) -> list[ExecResult]:
    files = getFilesFromDirectory(dirPath)

    results = []

    for file in files:
        result = runFile(file)
        results.append(result)

    return results
