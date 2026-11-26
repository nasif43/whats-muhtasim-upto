# Repository Agent Instructions — `whats-muhtasim-upto`

## 1. Mandatory Git Sync Before Any Work
This site persists live Kanban board edits from the browser directly to `origin/main` (`kanban.json` via the GitHub Contents API with commit message `chore: update kanban board from web`). Local clones become stale whenever the board is updated from the live site.

Before reading/editing files or planning changes, **ALWAYS**:
1. Inspect local status first (`git status`). Never discard uncommitted changes without explicit user approval.
2. Sync with `origin/main`:
   ```bash
   git fetch origin && git pull --rebase origin main
   ```
3. Check recent commits (`git log -n 5 --oneline`) to catch recent web `kanban.json` updates.

## 2. Git Best Practices
- Never force-push `main`, rewrite published history, or commit secrets/tokens. GitHub PATs belong solely in browser `localStorage` under `muhtasim_gh_pat`.
- Preserve existing `kanban.json` items and IDs (`kb-*`) unless explicitly asked to edit board entries.
- Inspect `git status` and `git diff` before staging, stage only intended files, and write concise imperative/conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`).
- Run `node --test tests/unit.test.mjs` before committing JavaScript or data changes.

## 3. Architecture & GitHub Pages Constraints
- **Zero-build static site** deployed on GitHub Pages (`nasif43/whats-muhtasim-upto`, `main` branch `/`, served under `/whats-muhtasim-upto/`).
- Do not introduce bundlers, `package.json`, or `node_modules` unless explicitly requested.
- **Relative paths only**: Always use `./css/...`, `./js/...`, `./kanban.json`. Never use leading `/` root-relative paths, which break under the `/whats-muhtasim-upto/` subpath.
- Codebase layout:
  - `index.html` — semantic shell (Kanban default view, Work log, Class Schedule, PAT sync dialog)
  - `kanban.json` — canonical 19-item Kanban dataset (8-key schema)
  - `css/` — modular stylesheets (`tokens.css`, `base.css`, `components.css`, `views.css`)
  - `js/` — browser-native ES modules (`data.js`, `github-sync.js`, `icons.js`, `kanban.js`, `work.js`, `schedule.js`, `main.js`)
  - `tests/unit.test.mjs` — zero-dependency `node:test` contract & regression suite
  - `README.md` — setup, Pages deployment, persistence workflow, and testing guide

## 4. `kanban.json` Schema & Target-Map Parity
- Every item in `kanban.json` and `DEFAULT_KB_ITEMS` (`js/data.js`) must preserve the exact 8-key schema:
  `id`, `title`, `cat` (`mobile` | `odoo` | `web` | `rnd`), `tag`, `tagClass`, `stage` (`scoping` | `active` | `testing` | `shipped`), `date`, `note`.
- Keep `DEFAULT_KB_ITEMS` and `WORK_TARGET_MAP` in `js/data.js` synchronized with `kanban.json` and the Work view cards in `index.html`.

## 5. Verification & Local Preview
- Run unit/contract tests (requires Node >= 22.12):
  ```bash
  node --test tests/unit.test.mjs
  ```
- Preview locally over HTTP (never `file://`, which fails CORS for ES modules and `fetch('./kanban.json')`):
  ```bash
  python3 -m http.server 8080
  ```
