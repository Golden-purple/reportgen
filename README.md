## reportgen

CLI tool to automate the tedious part of report submission: running your programs, capturing their output, and compiling everything into a PDF.

Point `reportgen` to a directory of program files. It will:

1. Scan the directory for supported source files (`.py`, `.c`, `.cpp` currently)
2. Compile and run each one
3. Extract the question text and the code itself from each file
4. Capture stdout, stderr, and the exit code
5. Render everything into a Markdown report
6. Convert that report into a PDF

`<directory-name>.md` and `<directory-name>.pdf` will get generated in the the same directory of the programs.

## Installation

Clone the repo and install locally:

```bash
git clone https://github.com/Golden-purple/reportgen.git
cd reportgen
pip install -e .
```

This installs the `reportgen` command on your PATH (via the entry point defined in `pyproject.toml`).

### External requirements

`reportgen` uses system tools it does **not** install for you:

| Tool | Needed for | Install (Fedora) |
|---|---|---|
| `gcc` | Running `.c` files | usually preinstalled / `sudo dnf install gcc` |
| `g++` | Running `.cpp` files | `sudo dnf install gcc-c++` |
| `pandoc` | Markdown to PDF conversion | `sudo dnf install pandoc` |
| A LaTeX engine (`pdflatex`) | PDF rendering via Pandoc | `sudo dnf install texlive-scheme-basic` (or `texlive-full` if you hit missing-package errors) |

If pandoc or `pdflatex` aren't found, `reportgen` will still generate the `.md` report but will print an error instead of a PDF.

So if you do not want to download pdflatex, can get the ```<Directory>```.md file and convert it yourself.
## Usage

```bash
reportgen <directory>
```

Example:

```bash
reportgen ./Lab2
```

This produces:

```
Lab2/
├── q1.c
├── q2.cpp
├── q3.py
├── Lab2.md     
└── Lab2.pdf      # generated report contains output of all 3 program files.
```

Name the files: q1, q2, q3... or question1, question2...

# Conventions: 

### **IMPORTANT** 
`reportgen` expects the assignment question to be written as a **multi-line comment at the very top of the file**, before anything else — including imports.

**Python** - triple-quoted string as the first statement:

```python
"""
Write an program to compute the sum of an array.
"""
# rest of your code
```

**C / C++** - `/* ... */` block comment as the first thing in the file even before header files:

```c
/*
Write a C program using OpenMP to parallelize matrix multiplication.
*/

#include <stdio.h>
#include <omp.h>
// rest of your code
```

Rules:

- Only the **first** matching comment block is treated as the question — everything after it is treated as code and reproduced in full in the report.
- If no matching comment is found at the start of the file, the report shows **"Question not provided."** for that file, but the code still runs and its output is still included.

## Supported file types

| Extension | Language | Execution |
|---|---|---|
| `.py` | Python | Run directly with the interpreter running `reportgen` |
| `.c` | C | Compiled with `gcc <file> -fopenmp -o <file>` |
| `.cpp` | C++ | Compiled with `g++ <file> -fopenmp -o <file>` |

`-fopenmp` is passed automatically on every C/C++ compile, so OpenMP programs work out of the box with no extra flags needed on your end.

## What the reports look like

For each file the PDF includes:

- The source filename
- The question (extracted from the top comment, or "Question not provided.")
- The code, syntax-highlighted by language
- The exit code of the run
- The output: stdout if the program produced any, otherwise stderr (so failed/crashed programs still show something useful instead of a blank page)

## Limitations

- **No input support.** Programs that wait for interactive input will hang.
- **No timeout.** An infinite loop in a submitted file will hang `reportgen` indefinitely — kill with Ctrl+C if you suspect an infinite loop.

## Contributing

Issues and PRs are welcome — this started as a personal tool to automate the "Code to Word to PDF" work for submissions, so contributions that make it viable across setups (Windows, timeouts on infinite loops, nested directories, more languages, etc.) are useful.

## License

MIT
