import sys

import pytest

from reportgen import cli
from reportgen.constants import RENDER_FAILURE_EXIT_CODE
from reportgen.pdf import PDFConversionError


def make_workdir(tmp_path):
    workdir = tmp_path / "work"
    workdir.mkdir()
    (workdir / "ok.py").write_text('"""Say hi."""\nprint("hi")\n')
    return workdir


def test_render_failure_exits_3(tmp_path, monkeypatch, capsys):
    workdir = make_workdir(tmp_path)

    def fake(mdPath, pdfPath):
        raise PDFConversionError("boom")

    monkeypatch.setattr(cli, "md2PDF", fake)
    monkeypatch.setattr(sys, "argv", ["reportgen", str(workdir)])

    with pytest.raises(SystemExit) as exc:
        cli.main()

    assert exc.value.code == RENDER_FAILURE_EXIT_CODE
    assert (workdir / "work.md").exists()
    assert "PDF conversion failed: boom" in capsys.readouterr().err


def test_usage_exit_1(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["reportgen"])

    with pytest.raises(SystemExit) as exc:
        cli.main()

    assert exc.value.code == 1


def test_success_no_exit(tmp_path, monkeypatch):
    workdir = make_workdir(tmp_path)

    def fake(mdPath, pdfPath):
        pass

    monkeypatch.setattr(cli, "md2PDF", fake)
    monkeypatch.setattr(sys, "argv", ["reportgen", str(workdir)])

    cli.main()

    assert (workdir / "work.md").exists()
