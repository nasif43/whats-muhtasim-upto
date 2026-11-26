@AGENTS.md
@.gemini/rules/git-workflow.md

> Summary (canonical rules in `AGENTS.md` and `.gemini/rules/git-workflow.md`):
> Always run `git fetch origin && git pull --rebase origin main` before starting work because the live site commits `kanban.json` directly to `origin/main` (`chore: update kanban board from web`). Follow git best practices (check `git status`/`git diff`, never force-push `main`, never commit secrets/PATs), keep `./` relative paths for GitHub Pages `/whats-muhtasim-upto/`, keep `kanban.json` 8-key schema + `DEFAULT_KB_ITEMS`/`WORK_TARGET_MAP` in sync, and verify with `node --test tests/unit.test.mjs` (Node >= 22.12).
