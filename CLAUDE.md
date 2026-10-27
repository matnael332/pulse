# CLAUDE.md

## Language and output

- Always answer the user in Hebrew (right to left), whatever language the request or the material
  is in, with as little English as possible: English only for code, identifiers, file paths and
  commands.
- User-facing text meant for Hebrew readers (UI copy, reports, plans) is Hebrew, right to left.
- Write reports and plans in plain Markdown: no box-drawing tables or terminal-width layouts.

## Working within the request

- Do only what the current request or approved plan covers. No unrequested actions (extra
  deletions such as `rm -rf __pycache__`, extra wording, examples or dates), and no new ideas
  when the user asked to follow the plan.
- An authorization block the user pasted is approval to start: do not ask for "go" again unless
  something is ambiguous or destructive.
- Checkpoint flow: check the repository state, stage only the intended files, commit, push, then
  confirm CI passed on the exact pushed commit before calling anything done.
- Re-derive every number you report (test counts, file counts) from the source for that commit;
  never copy it from an earlier message or document.
- Merge a pull request only after both CI checks (`test`, `docker`) pass on its head commit, with
  `gh pr merge N --rebase --delete-branch`, and only with the user's approval for merging.
- Avoid stacked pull requests: force pushes are blocked here, so base each branch on `main` and
  open the next one after the previous is merged.
- Never touch secrets, `.env` or credential files without explicit approval.

## Stage numbering

- One scheme: "step 6, sub-phase N" (שלב 6, שלב משנה N); 5a and 5b for a sub-phase split into
  two pull requests. Before proposing the next step, confirm where the work stands from `git log`,
  `gh pr list` and the memory notes.

## Environment gotchas

- Windows, Git Bash and PowerShell. The machine has limited memory: run long jobs in batches,
  stop local servers when done, and never promise a server "will keep running".
- Git Bash heredocs turn `\\` into `\`: write scripts that contain backslashes with the Write or
  Edit tools, not heredocs.
- Set `PYTHONIOENCODING=utf-8` before printing Hebrew from Python (otherwise cp1252 errors).
- In Git Bash, `docker compose exec` with container paths needs `MSYS_NO_PATHCONV=1`.
- Scratch databases and test runs use temporary paths, never the user's local `var/` data or
  credential files.
