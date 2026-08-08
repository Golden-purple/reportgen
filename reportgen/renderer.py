from reportgen.models import ExecResult

def generateMarkdown(results: list[ExecResult]) -> str:

    lines = []

    lines.append("## Assignment Report")
    lines.append("")

    count = 0

    for result in results:
        count+=1
        if result.fileName.endswith(".py"):
            lang = "python"
        elif result.fileName.endswith(".cpp"):
            lang = "cpp"
        elif result.fileName.endswith(".c"):
            lang = "c"
        else:
            lang = ""

        lines.append(f"### File: {result.fileName}")
        lines.append("")

        lines.append(f"### Question {count}")
        lines.append(result.question.rstrip())
        lines.append("")

        lines.append("### Code")
        lines.append(f"```{lang}")
        lines.append(result.code.rstrip())
        lines.append("```")
        lines.append("")

        lines.append(f"**Exit Code:** {result.returncode}")
        lines.append("")

        if(result.stdout): 
            output = result.stdout 
        else:
            output = result.stderr

        lines.append("### Output")
        lines.append("```")
        lines.append(output.rstrip())
        lines.append("```")
        lines.append("")

    return "\n".join(lines)