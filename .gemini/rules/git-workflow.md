# Mandatory Git Sync & Workflow Rules (Antigravity / Gemini)

1. **Always pull before starting any work**:
   The live site commits `kanban.json` updates directly to `origin/main` from the browser via the GitHub Contents API (`chore: update kanban board from web`). Before inspecting code or making edits, sync with remote:
   ```bash
   git status
   git fetch origin && git pull --rebase origin main
   ```
   If the working tree has uncommitted changes, ask or stash cleanly before rebasing—never discard uncommitted work silently.

2. **Protect live board data, paths, and credentials**:
   - Never overwrite `kanban.json` with stale local data or commit GitHub PATs (`muhtasim_gh_pat` stays in browser `localStorage` only).
   - Preserve the 8-key `kanban.json` schema (`id`, `title`, `cat`, `tag`, `tagClass`, `stage`, `date`, `note`) and keep `DEFAULT_KB_ITEMS` + `WORK_TARGET_MAP` in `js/data.js` synchronized.
   - Use relative `./` asset and fetch paths (`./css/...`, `./js/...`, `./kanban.json`) so GitHub Pages subpath `/whats-muhtasim-upto/` resolves cleanly.

3. **Git hygiene & pre-commit verification**:
   - Review `git status` and `git diff` before committing; use concise imperative/conventional commit messages.
   - Never force-push `main` or rewrite published history.
   - Verify with `node --test tests/unit.test.mjs` (Node >= 22.12).
