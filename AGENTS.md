# TeamBrain contribution rules

TeamBrain is local-first. AvenoxBeyin is private working memory; TeamBrain is the reviewed shared source of truth; Obsidian is a Markdown reader/editor; Serena is for code symbols and safe refactors only.

Never copy raw chat, secrets, credentials, personal notes, or unredacted customer data into `shared/`. Publish one reviewed, source-linked receipt per meaningful outcome. Drafts belong in `shared/90-receipts/pending/`; only human-reviewed records become canonical decisions, projects, or knowledge.

Git is history and review, not a live database. Prefer one file per receipt/handoff and a user/agent branch. Do not auto-approve hooks or expose the loopback server publicly.

When a user asks to add a GitHub repository, ask for the exact URL and show it back for confirmation. Do not infer, substitute, clone, or connect a repository from natural-language hints alone. Use `teambrain repo add`; it keeps every repository in an isolated directory and refreshes members only for that repository.
