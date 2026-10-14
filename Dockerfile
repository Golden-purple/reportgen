FROM python:3.12-slim-bookworm 

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ \
        texlive-latex-recommended texlive-latex-extra lmodern \
    && rm -rf /var/lib/apt/lists/*

ADD https://github.com/jgm/pandoc/releases/download/3.8.3/pandoc-3.8.3-1-amd64.deb /tmp/pandoc.deb

RUN dpkg -i /tmp/pandoc.deb && rm -f /tmp/pandoc.deb

COPY pyproject.toml README.md ./
COPY reportgen/ ./reportgen/

RUN python -m pip install --no-cache-dir .