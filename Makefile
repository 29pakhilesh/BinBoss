.PHONY: help install run lan dev cli interactive list-bins pull-models pull-text pull-vision clean

.DEFAULT_GOAL := help

VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

PORT ?= 8080
HOST ?= 127.0.0.1
OLLAMA_MODEL ?= llama3.2
OLLAMA_VISION_MODEL ?= moondream
ITEM ?=

export OLLAMA_MODEL
export OLLAMA_VISION_MODEL

help:
	@echo "  make install      venv + pip install"
	@echo "  make run          web UI"
	@echo "  make lan          web UI on home Wi-Fi"
	@echo "  make pull-models  ollama pull text + vision"
	@echo "  make cli ITEM=…   classify one item"
	@echo "  make interactive  CLI loop"
	@echo "  make list-bins    show dustbins"

$(VENV)/bin/python:
	python3 -m venv $(VENV)

install: $(VENV)/bin/python
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

run: install
	HOST=$(HOST) PORT=$(PORT) $(PYTHON) app.py

lan: install
	HOST=0.0.0.0 PORT=$(PORT) $(PYTHON) app.py

dev: run

cli: install
	@test -n "$(ITEM)" || (echo 'Usage: make cli ITEM="plastic bottle"' && exit 1)
	$(PYTHON) waste_classifier.py "$(ITEM)"

interactive: install
	$(PYTHON) waste_classifier.py

list-bins: install
	$(PYTHON) waste_classifier.py --list-bins

pull-text:
	ollama pull $(OLLAMA_MODEL)

pull-vision:
	ollama pull $(OLLAMA_VISION_MODEL)

pull-models: pull-text pull-vision

clean:
	rm -rf $(VENV)
	@find . -path './.venv' -prune -o -type d -name __pycache__ -print0 2>/dev/null \
		| xargs -0 rm -rf 2>/dev/null || true
