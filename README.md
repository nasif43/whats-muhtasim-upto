# What's Muhtasim Up To

Personal work-log, interactive Kanban board (default view), and IUB Autumn 2026 class schedule.

- **Live site**: https://nasif43.github.io/whats-muhtasim-upto/
- **Repository**: `nasif43/whats-muhtasim-upto`

## Architecture & File Layout

This is a **zero-build static web application** using semantic HTML5, CSS custom properties, and browser-native ES modules (`<script type="module">`) with zero runtime dependencies or bundler toolchain.

```text
whats-muhtasim-upto/
├── AGENTS.md                   # Canonical AI agent git-workflow & repository rules
├── CLAUDE.md                   # Claude Code pointer (@AGENTS.md)
├── GEMINI.md                   # Gemini / Antigravity pointer
├── .gemini/rules/
│   └── git-workflow.md         # Antigravity (agy) mandatory git sync & safety rules
├── README.md                   # Project documentation
├── index.html                  # Semantic entry page (Kanban default, Work, Classes, PAT dialog)
├── kanban.json                 # Canonical 19-item Kanban dataset
├── css/
│   ├── tokens.css              # Light/dark design tokens, typography, and spacing
│   ├── base.css                # Base reset, landmarks, focus styles, scrollbars
│   ├── components.css          # Reusable buttons, tabs, cards, badges, dialogs, status
│   └── views.css               # Kanban board, Work log, Omnichannel showcase, Class Schedule
├── js/
│   ├── data.js                 # COLUMNS, CATEGORIES, DEFAULT_KB_ITEMS, WORK_TARGET_MAP, SCHEDULE_DATA
│   ├── github-sync.js          # GitHub Contents API + localStorage PAT & draft persistence
│   ├── icons.js                # Inline SVG icon helpers
│   ├── kanban.js               # Kanban board rendering, filters, drag-and-drop, card navigation
│   ├── work.js                 # Work view expand/collapse, older projects, devlog, target focus
│   ├── schedule.js             # IUB Autumn 2026 timetable & live Asia/Dhaka "Today" banner
│   └── main.js                 # App bootstrap, tab/hash routing, theme toggle, PAT dialog
└── tests/
    └── unit.test.mjs           # Zero-dependency node:test contract & regression suite
```

## GitHub Pages Deployment

- Hosted via GitHub Pages (`legacy` mode) directly from the `main` branch root (`/`), served under the repository subpath `/whats-muhtasim-upto/`.
- All internal CSS, JS, and data requests use relative `./` paths (`./css/...`, `./js/...`, `./kanban.json`) rather than leading `/` root paths so local previews and `/whats-muhtasim-upto/` resolve identically.

## Local Preview

Opening `index.html` directly via `file://` will fail because browsers block `<script type="module">` imports and `fetch('./kanban.json')` requests under `file://` CORS rules. Always serve over HTTP:

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`. To mirror the exact GitHub Pages subpath locally, run the server from the parent directory and open `http://127.0.0.1:8080/whats-muhtasim-upto/`.

## `kanban.json` Schema & Persistence Workflow

### 8-Key Item Schema
Each entry in `kanban.json` (and `DEFAULT_KB_ITEMS` in `js/data.js`) uses 8 exact keys:

| Key | Description |
|---|---|
| `id` | Stable `kb-*` identifier mapped in `WORK_TARGET_MAP` |
| `title` | Card heading |
| `cat` | Filter category (`mobile`, `odoo`, `web`, `rnd`) |
| `tag` | Display badge label |
| `tagClass` | Tag styling class (`ts`, `oo`, `py`, `fl`, `cf`, `ans`) |
| `stage` | Column stage (`scoping`, `active`, `testing`, `shipped`) |
| `date` | Timeline label |
| `note` | Concise summary text |

### Browser Drafts & GitHub PAT Sync
1. **Read & Offline Fallback**: On load, `js/github-sync.js` fetches `./kanban.json?t=<timestamp>` and falls back to `DEFAULT_KB_ITEMS` if unreachable.
2. **Local Drafts**: Moving cards via drag-and-drop or the stage `<select>` saves local stage overrides to `localStorage` under `muhtasim_kanban_v1` (`KB_STORAGE_KEY`). Reverting all cards to remote/default stages clears the draft automatically.
3. **Owner Sync via Fine-Grained PAT**:
   - Unlock sync using a GitHub fine-grained Personal Access Token scoped solely to `nasif43/whats-muhtasim-upto` with **Contents: Read and write** permission.
   - The PAT is stored only in browser `localStorage` under `muhtasim_gh_pat` (`KB_PAT_KEY`) and never committed to git.
   - Saving fetches the latest `sha` from `GET /repos/nasif43/whats-muhtasim-upto/contents/kanban.json`, prompts for confirmation if the remote `sha` changed since page load, and commits the updated `kanban.json` via `PUT` with message `chore: update kanban board from web` (live on GitHub Pages in ~30–35 seconds).

## Testing

The unit and contract suite uses Node's built-in `node:test` runner and requires **Node >= 22.12** (native ESM detection without a `package.json`):

```bash
node --test tests/unit.test.mjs
```
