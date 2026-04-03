<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/opencode--mux-v1.0.0-blue?style=for-the-badge">
    <source media="(prefers-color-scheme: light)" srcset="https://img.shields.io/badge/opencode--mux-v1.0.0-blue?style=for-the-badge">
    <img alt="OpenCode Mux" src="https://img.shields.io/badge/opencode--mux-v1.0.0-blue?style=for-the-badge">
  </picture>
</p>

<p align="center"><strong>Multi-key, multi-model routing for OpenCode with OpenRouter.</strong></p>

<p align="center">
  Never hit a rate limit again. Mux automatically switches between your API keys and models to keep you coding.
</p>

<p align="center">
  <a href="https://github.com/hacimertgokhan/opencode-mux"><img alt="GitHub" src="https://img.shields.io/github/stars/hacimertgokhan/opencode-mux?style=flat-square" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

---

## What is Mux?

Mux is a smart routing layer built on top of [OpenCode](https://opencode.ai) that works with [OpenRouter](https://openrouter.ai) API keys. It automatically manages multiple API keys and models to:

- **Avoid rate limits** — when one key runs out of credits, Mux switches to another
- **Optimize costs** — route prompts across your selected models based on availability
- **Stay productive** — no manual key switching needed

## Features

- **Multi-key management** — add multiple OpenRouter API keys and let Mux pick the best one
- **Model selection** — choose which models Mux can use from your OpenRouter catalog
- **Auto-switching** — when a key's credits run low, Mux automatically switches to a key with more credits
- **Model availability view** — see at a glance which models are usable with each key
- **Key status monitoring** — check token usage and remaining credits for all keys

## Installation

### Quick Install (recommended)

```bash
# Windows (PowerShell)
irm https://raw.githubusercontent.com/hacimertgokhan/opencode-mux/main/install-mux.ps1 | iex

# Linux/macOS
curl -fsSL https://raw.githubusercontent.com/hacimertgokhan/opencode-mux/main/install | bash
```

### Manual Install

1. Clone this repository
2. Run `bun install` in the project root
3. Run `bun run build` in `packages/opencode`
4. Copy the built binary to your PATH

### Usage

After installation, run:

```bash
mux
```

This launches OpenCode with Mux routing enabled. You can also run `opencode-mux` directly.

### Mux Commands

Inside the TUI, use `/mux` to open the Mux router menu:

| Command | Description |
|---------|-------------|
| `/mux` | Open the Mux router menu |
| `/mux-status` | Show key usage and credit status |
| `/mux-keys` | Manage API keys (add, remove, activate, test) |
| `/mux-models` | Select which models Mux can use |
| `/mux-switch` | Switch to the key with the most remaining credits |
| `/mux-about` | Show project information |

**Keyboard shortcut:** Press `Tab` with an empty prompt to toggle Mux mode on/off.

## Configuration

Mux stores its configuration in `~/.opencode-router-manager/config.json`. You can manage everything through the TUI dialogs — no manual config editing needed.

## How It Works

1. **Add your OpenRouter API keys** using `/mux-keys` → Add Key
2. **Select your preferred models** using `/mux-models`
3. **Enable Mux mode** by pressing `Tab` in the prompt or via `/mux` → Enable
4. **Start coding** — Mux automatically routes your prompts to the best available key and model

When you send a message, Mux checks:
- Can the current key afford the selected model? If yes, use it.
- If not, is there another key with enough credits? If yes, switch.
- If the current model is unavailable, try other selected models.

## Project Structure

```
packages/
├── opencode/          # Forked OpenCode with Mux integration
│   └── src/
│       ├── router-manager/        # Core Mux routing logic
│       └── cli/cmd/tui/
│           └── component/
│               └── dialog-router-manager.tsx  # Mux TUI dialogs
└── ...
```

## License

This project incorporates OpenCode (licensed under the Apache License 2.0) with additional Mux functionality. See [LICENSE](LICENSE) for details.

---

**Built with ❤️ by** [hacimertgokhan](https://github.com/hacimertgokhan)

**Join the community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
