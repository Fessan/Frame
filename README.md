# Frame

Terminal-first desktop app for running AI coding tools in real project context (Claude Code, Codex CLI, and more).

<img width="1464" height="852" alt="Screenshot 2026-01-28 at 01 00 37" src="https://github.com/user-attachments/assets/8699c91f-35ea-4c3d-b871-56962e427017" />

## What is Frame?

Frame is an Electron app that brings order and memory to AI-assisted development:

1. **Standardize projects** with a consistent set of files: `AGENTS.md`, `STRUCTURE.json`, `PROJECT_NOTES.md`, and `tasks.json`.
2. **Preserve context** as projects grow: decisions, session notes, and task tracking live with the repo.
3. **Make execution effortless**: pick a project, pick a tool, run it in the right directory without `cd` churn.

Frame combines:
- **Projects + File Explorer** (sidebar) for fast navigation across multiple repos
- **Multi-terminal** (tabs + grid) with real PTY support (node-pty + xterm.js)
- **Prompt history** panel (commands with timestamps)
- **Tasks** panel (Frame-managed `tasks.json`)
- **Tool-aware panels** like Plugins (Claude Code) and GitHub (issues/branches/worktrees)

## Supported AI Tools

Out of the box, Frame ships with tool profiles for:
- **Claude Code** (expects `claude` in `PATH`)
- **Codex CLI** (expects `codex` in `PATH`)

You can switch tools in the UI (dropdown next to Start button) or from the app menu. The menu adapts to the active tool (commands, labels).

### Why wrappers exist

Some tools (like Claude Code) automatically read instruction files (`CLAUDE.md`). Others do not.

For tools that need it, Frame generates wrapper scripts inside Frame-managed projects:
- `.frame/bin/<tool>`

When you start the tool from Frame, it uses the wrapper (if present) to prompt the tool to read `AGENTS.md` first.

## Installation

### Prerequisites
- Node.js (LTS recommended)
- npm

### Run locally

```bash
git clone https://github.com/kaanozhan/Frame.git
cd Frame
npm install
npm start
```

### Install at least one AI tool

Frame does not bundle AI CLIs. Install the tool(s) you want and ensure the executable is available in your `PATH`:
- `claude` (Claude Code)
- `codex` (Codex CLI)

## Usage

### Basic workflow

1. Launch Frame: `npm start`
2. Add/select a project (left sidebar)
3. Choose your AI tool in the selector (Claude, Codex, ...)
4. Click **Start** (or use the app menu: `CmdOrCtrl+K`)

Frame restarts the terminal in the selected project directory and runs the tool (wrapper-aware when applicable).

### Frame-managed projects

If a repo is not initialized as a Frame project yet, you can initialize or upgrade it from the sidebar actions. Frame creates (without overwriting existing files):
- `.frame/` (config directory)
- `AGENTS.md` (AI assistant instructions)
- `CLAUDE.md` (symlink/copy to `AGENTS.md` for Claude Code compatibility)
- `STRUCTURE.json` (module map)
- `PROJECT_NOTES.md` (session notes)
- `tasks.json` (task tracking)
- `QUICKSTART.md` (onboarding)
- `.frame/bin/` (wrappers for tools that need them, e.g. Codex)

## Keyboard shortcuts

The menu and UI provide most actions without shortcuts. These are the core ones:

- `CmdOrCtrl+K`: start the active AI tool
- `CmdOrCtrl+Shift+T`: new terminal
- `CmdOrCtrl+Shift+W`: close terminal
- `CmdOrCtrl+Tab` / `CmdOrCtrl+Shift+Tab`: next/previous terminal
- `CmdOrCtrl+Shift+H`: toggle prompt history panel
- `CmdOrCtrl+H`: open prompt history file
- `CmdOrCtrl+Shift+P`: toggle plugins panel (Claude Code)
- `CmdOrCtrl+T`: toggle tasks panel
- `CmdOrCtrl+B`: toggle sidebar
- `CmdOrCtrl+Shift+[` / `CmdOrCtrl+Shift+]`: previous/next project

## Development

```bash
# Watch renderer + run Electron
npm run dev
```

## Troubleshooting

### "claude: command not found" / "codex: command not found"
Install the corresponding tool and ensure it is in `PATH`.

### GitHub panel shows "gh CLI not installed"
Install GitHub CLI (`gh`) and authenticate, then reopen the panel.

### "Cannot find module 'node-pty'"
```bash
npm install
```

## License

MIT License. See `LICENSE`.
