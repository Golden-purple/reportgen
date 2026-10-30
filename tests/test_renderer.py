from reportgen.models import ExecResult
from reportgen.renderer import generateMarkdown


def result(fileName="a.py", stdout="", stderr="", returncode=0):
    return ExecResult(fileName, "A question", "print(1)", stdout, stderr, returncode)


def test_stdout_wins_over_stderr():
    markdown = generateMarkdown([result(stdout="STDOUT_MARKER\n", stderr="STDERR_MARKER\n")])

    assert "### Question 1" in markdown
    assert "```python" in markdown
    assert "**Exit Code:** 0" in markdown
    assert "STDOUT_MARKER" in markdown
    # Documents the current rule: stderr is shown only when stdout is empty.
    assert "STDERR_MARKER" not in markdown


def test_timeout_message_is_shown_when_stdout_is_empty():
    message = "Execution timed out after 3 seconds."
    markdown = generateMarkdown([result(stderr=message, returncode=124)])

    assert message in markdown
    assert "**Exit Code:** 124" in markdown


def test_questions_are_numbered_and_fences_follow_the_extension():
    markdown = generateMarkdown([result("a.py"), result("b.cpp"), result("c.c")])
    lines = markdown.splitlines()

    assert "### Question 2" in markdown
    assert "### Question 3" in markdown
    assert "```python" in lines
    assert "```cpp" in lines
    assert "```c" in lines
