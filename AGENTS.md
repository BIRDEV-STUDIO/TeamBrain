# TeamBrain contribution rules

TeamBrain is local-first. AvenoxBeyin is private working memory; TeamBrain is the reviewed shared source of truth; Obsidian is a Markdown reader/editor; Serena is for code symbols and safe refactors only.

Never copy raw chat, secrets, credentials, personal notes, or unredacted customer data into `shared/`. Publish one reviewed, source-linked receipt per meaningful outcome. Drafts belong in `shared/90-receipts/pending/`; only human-reviewed records become canonical decisions, projects, or knowledge.

Git is history and review, not a live database. Prefer one file per receipt/handoff and a user/agent branch. Do not auto-approve hooks or expose the loopback server publicly.

When a user asks to add a GitHub repository, ask for the exact URL and show it back for confirmation. Do not infer, substitute, clone, or connect a repository from natural-language hints alone. Use `teambrain connect github` for a TeamBrain memory repository; use `teambrain repo add` for a separate code repository registry entry. Both keep repository boundaries isolated.

When a user pastes a TeamBrain memory repository into a terminal AI session, run the interactive `teambrain connect github --url <exact-url>` setup and let the user confirm: the exact repository URL, the local memory destination, the stable TeamBrain actor/member identity, and whether background synchronization is enabled. Show the final choices before cloning or writing `.teambrain/connection.json`. If the user gives a code repository rather than a memory repository, explain the difference and ask whether it should be connected with `teambrain connect project` instead.
