<div align="center">

<img src="apps/electron-desktop/assets/icon-sm.png" alt="Atomic Bot" width="128">

# Atomic Bot

### Your personal AI assistant — right on your desktop.

One app. All your AI models. All your tools. All your messengers.

**[Get Atomic Bot](https://atomicbot.ai)** · **[Download for macOS](https://atomicbot.ai)** · **[Download for Windows](https://atomicbot.ai)**

[![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon-000?style=for-the-badge&logo=apple&logoColor=white)](https://atomicbot.ai)
[![Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://atomicbot.ai)

</div>

---

## What is Atomic Bot?

Atomic Bot is a desktop AI assistant that connects the best AI models to the tools and messengers you already use — without switching tabs, copying text, or juggling multiple apps.

Install it once, pick your AI provider, and start chatting. Atomic Bot handles the rest: it reads your messages across Telegram, Slack, Discord, and more — and replies for you with the power of Claude, GPT, Gemini, or any model you choose.

## Why Atomic Bot?

| Problem                                        | Atomic Bot                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Switching between ChatGPT, Claude, Gemini tabs | **One app, all models** — switch with a click                                             |
| Copy-pasting AI answers into messengers        | **Auto-replies** across Telegram, Slack, Discord, and more                                |
| No access to your files, notes, calendar       | **Built-in skills** — Google Workspace, Notion, GitHub, Obsidian, Apple Notes & Reminders |
| Voice input requires extra tools               | **Built-in Whisper** — hold a button and talk, locally or via API                         |
| AI can't run commands on your machine          | **Embedded terminal** with exec approval — AI runs commands, you stay in control          |

## Features

### Chat with any AI model

Use the best model for the task. Switch providers and models on the fly.

- **Anthropic** — Claude 4 / Opus / Sonnet
- **OpenAI** — GPT-4.1 / o3 / o4-mini
- **Google** — Gemini 2.5 Pro / Flash
- **xAI** — Grok
- **OpenRouter** — 200+ models in one place
- **NVIDIA NIM**, **Venice AI**, **MiniMax**, **Moonshot**, **Kimi Coding**, **Z.ai** and more

Bring your own API key or use a managed subscription — your choice.

### Talk to your AI

Hold the microphone button and speak. Atomic Bot transcribes your voice using **Whisper** — either locally (no data leaves your machine) or via the OpenAI Whisper API for maximum accuracy. Three local model sizes: Small, Medium, Large.

### Connect your messengers

Receive and reply to messages across your favorite platforms — all through one AI-powered interface.

- **Telegram** — bot token setup in seconds
- **Slack** — Socket Mode, no public endpoint needed
- **Discord** — full bot integration
- **WhatsApp** — QR code pairing
- **Signal** — via signal-cli
- **iMessage** — native macOS integration
- **Matrix** · **Microsoft Teams** — and more coming soon

### Skills & integrations

Atomic Bot doesn't just chat — it _does things_. Enable skills to give your AI superpowers:

| Skill                | What it does                                      |
| -------------------- | ------------------------------------------------- |
| **Google Workspace** | Read & draft emails, check calendar, manage inbox |
| **Notion**           | Search pages, query databases, create content     |
| **GitHub**           | Browse PRs, issues, create workflows              |
| **Obsidian**         | Search your vaults, read and write notes          |
| **Trello**           | Manage boards, cards, and lists                   |
| **Apple Notes**      | Create and search notes (macOS)                   |
| **Apple Reminders**  | Add and manage reminders (macOS)                  |
| **Web Search**       | Search the web with advanced queries              |
| **Media Analysis**   | Understand images, audio, and video               |
| **ElevenLabs**       | Generate natural speech                           |
| **Image Generation** | Create images from text prompts                   |
| **Custom Skills**    | Upload your own skill packages                    |

### Embedded terminal

A full terminal lives inside Atomic Bot. Your AI can suggest and run shell commands — with your explicit approval every time. Allow once, always allow, or deny. You stay in control.

### Smart exec approval

When the AI wants to run a command, you see exactly what it plans to do. One click to approve, deny, or auto-approve that command pattern. Security by default, convenience by choice.

### Auto-updates

Atomic Bot keeps itself up to date. New version available? A banner appears, you click download, and restart when ready. Release notes included.

### Backup & restore

Export your entire configuration as a ZIP snapshot. Restore it on a new machine or after a reset — all your settings, keys, and skills come back instantly.

## Getting started

1. **Download** Atomic Bot from [atomicbot.ai](https://atomicbot.ai)
2. **Install** — drag to Applications (macOS) or run the installer (Windows)
3. **Choose your AI** — pick a provider, enter your API key or sign in with OAuth
4. **Enable skills** — connect Google, Notion, GitHub, or whatever you need
5. **Start chatting** — that's it, you're live

## Platforms

| Platform | Architecture          | Format                  |
| -------- | --------------------- | ----------------------- |
| macOS    | Apple Silicon (arm64) | `.dmg`                  |
| Windows  | x64                   | `.exe` (NSIS installer) |

## Built with

| Component | Technology                             |
| --------- | -------------------------------------- |
| Shell     | Electron                               |
| UI        | React, Redux Toolkit, React Router     |
| Build     | Vite, TypeScript, esbuild              |
| Terminal  | xterm.js, node-pty                     |
| Voice     | Whisper (local + API)                  |
| Markdown  | react-markdown, KaTeX (math rendering) |
| Updates   | electron-updater                       |

## Links

- **Website** — [atomicbot.ai](https://atomicbot.ai)
- **Support** — [atomicbot.ai](https://atomicbot.ai)

## Open source foundation

Atomic Bot is built on top of [OpenClaw](https://github.com/openclaw/openclaw) — an open-source personal AI assistant platform licensed under **MIT**. OpenClaw provides the gateway, agent runtime, channel integrations, and skills engine that power Atomic Bot under the hood.

## License

- **OpenClaw** (core engine) — [MIT License](https://github.com/openclaw/openclaw/blob/main/LICENSE)
- **Atomic Bot** (desktop app) — [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)
