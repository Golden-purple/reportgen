import shutil
import sys
import tempfile

import pytest

from reportgen import compiler
from reportgen.constants import MAX_OUTPUT_BYTES, TIMEOUT_RETURN_CODE, TRUNCATION_MARKER

needs_gcc = pytest.mark.skipif(
    not (sys.platform == "linux" and shutil.which("gcc")),
    reason="C tests need Linux and gcc",
)
needs_gpp = pytest.mark.skipif(
    not (sys.platform == "linux" and shutil.which("g++")),
    reason="C++ tests need Linux and g++",
)


def tmpfile_with(data: bytes):
    # Don't seek: readBounded has to rewind by itself, as it does after a real child process.
    f = tempfile.TemporaryFile()
    f.write(data)
    return f


def test_read_bounded_small():
    with tmpfile_with(b"hello\n") as f:
        assert compiler.readBounded(f) == "hello\n"


def test_read_bounded_exactly_limit():
    with tmpfile_with(b"x" * MAX_OUTPUT_BYTES) as f:
        text = compiler.readBounded(f)
    assert len(text) == MAX_OUTPUT_BYTES
    assert TRUNCATION_MARKER not in text


def test_read_bounded_over_limit():
    with tmpfile_with(b"x" * (MAX_OUTPUT_BYTES + 1)) as f:
        text = compiler.readBounded(f)
    assert text.startswith("x" * MAX_OUTPUT_BYTES)
    assert TRUNCATION_MARKER in text
    assert "x" * (MAX_OUTPUT_BYTES + 1) not in text


def test_read_bounded_invalid_utf8():
    with tmpfile_with(b"ok \xff\xfe end") as f:
        text = compiler.readBounded(f)
    assert text == "ok \\xff\\xfe end"
    assert "�" not in text


def test_run_py_normal(tmp_path):
    script = tmp_path / "ok.py"
    script.write_text('"""Say hello."""\nprint("hello")\n')

    result = compiler.runPyFile(script)

    assert result.returncode == 0
    assert result.stdout.strip() == "hello"
    assert result.question == "Say hello."
    assert result.code.strip() == 'print("hello")'


def test_run_py_flood_truncated(tmp_path):
    script = tmp_path / "flood.py"
    script.write_text('import sys\nsys.stdout.write("x" * 200_000)\n')

    result = compiler.runPyFile(script)

    assert result.returncode == 0
    assert TRUNCATION_MARKER in result.stdout
    assert len(result.stdout) < MAX_OUTPUT_BYTES + 200


def test_run_py_timeout(tmp_path, monkeypatch):
    monkeypatch.setattr(compiler, "PROGRAM_TIMEOUT_SECONDS", 1)
    script = tmp_path / "loop.py"
    script.write_text("while True:\n    pass\n")

    result = compiler.runPyFile(script)

    assert result.returncode == TIMEOUT_RETURN_CODE
    assert result.stdout == ""
    assert result.stderr == "Execution timed out after 1 seconds."


def test_run_py_stdin_is_empty(tmp_path):
    script = tmp_path / "ask.py"
    script.write_text("input()\n")

    result = compiler.runPyFile(script)

    assert result.returncode != TIMEOUT_RETURN_CODE
    assert result.returncode != 0
    assert "EOFError" in result.stderr


@needs_gcc
def test_run_c_compile_error(tmp_path):
    source = tmp_path / "bad.c"
    source.write_text("int main( { return 0; }\n")

    result = compiler.runCFile(source)

    assert result.returncode != 0
    assert "error" in result.stderr


@needs_gcc
def test_run_c_ok(tmp_path):
    source = tmp_path / "ok.c"
    source.write_text('/* Print hi. */\n#include <stdio.h>\nint main(void) { printf("hi\\n"); return 0; }\n')

    result = compiler.runCFile(source)

    assert result.returncode == 0
    assert result.stdout.strip() == "hi"


@needs_gpp
def test_run_cpp_ok(tmp_path):
    source = tmp_path / "ok.cpp"
    source.write_text('/* Print hi cpp. */\n#include <iostream>\nint main() { std::cout << "hi cpp\\n"; return 0; }\n')

    result = compiler.runCppFile(source)

    assert result.returncode == 0
    assert result.stdout.strip() == "hi cpp"
