from pathlib import Path

def extractQuestion(filePath: Path) -> str:
    content = filePath.read_text().strip()

    if content.startswith('"""'):
        end = content.find('"""', 3)
        if end != -1:
            return content[3:end].strip()
        
    if content.startswith("/*"):
        end = content.find("*/", 2)
        if end != -1:
            return content[2:end].strip()
    return "Question not provided."

def extractCode(filePath: Path) -> str:
    content = filePath.read_text()

    stripped = content.strip()

    if stripped.startswith('"""'):
        end = stripped.find('"""', 3)
        if end != -1:
            return stripped[end + 3:].lstrip()

    if stripped.startswith("/*"):
        end = stripped.find("*/", 2)
        if end != -1:
            return stripped[end + 2:].lstrip()

    return content
