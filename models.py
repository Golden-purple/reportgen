from dataclasses import dataclass

@dataclass(frozen=True)
class ExecResult:
    fileName: str
    question: str
    code: str
    stdout: str
    stderr: str
    returncode: int