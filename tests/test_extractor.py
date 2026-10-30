from reportgen.extractor import extractCode, extractQuestion


def test_python_docstring_question(tmp_path):
    source = tmp_path / "q.py"
    source.write_text('"""What is 2+2?"""\nprint(2 + 2)\n')

    assert extractQuestion(source) == "What is 2+2?"
    assert "What is 2+2?" not in extractCode(source)


def test_c_block_comment_question(tmp_path):
    source = tmp_path / "q.c"
    source.write_text("/* Sum two ints */\nint add(int a, int b) { return a + b; }\n")

    assert extractQuestion(source) == "Sum two ints"


def test_no_leading_comment(tmp_path):
    content = "print('no question here')\n"
    source = tmp_path / "plain.py"
    source.write_text(content)

    assert extractQuestion(source) == "Question not provided."
    assert extractCode(source) == content
