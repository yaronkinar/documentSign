Create a new document in DocFlow and add signers to it.

The user will provide (in any order, in natural language or as a list):
- Document title
- Template type OR a path to a PDF file
  - Supported template: `haknasot`
  - If neither is mentioned, default to `haknasot`
- One or more signers, each with a name and email
- Whether to submit immediately (default: leave as draft)

Once you have the information, run the script from the **repo root** (`C:\Users\yaron\WebstormProjects\documentSign`):

```bash
node scripts/create-document.mjs [options]
```

Available options:
- `--title "..."` — document title
- `--template haknasot` — use the haknasot form template
- `--pdf path/to/file.pdf` — upload a custom PDF
- `--signer "Name <email>"` — add a signer (repeat for multiple signers)
- `--step-label "..."` — workflow step label (default: חתימה)
- `--submit` — submit the document immediately after creation
- `--api http://...` — API URL (default: http://localhost:3001)
- `--token "..."` — bearer token (default: dev-bypass-token-local)

After running the script, report:
- The document ID and a link to view it: `http://localhost:3000/documents/<id>`
- The list of signers and their status
- Whether the document was submitted or left as draft

If the user provides `$ARGUMENTS`, parse them directly as options. If no arguments are given, ask the user for the required information (title and at least one signer) before running.

Example invocations the user might type:
- `/create-document haknasot titled "חוזה 2026" for Alice <alice@example.com> and Bob <bob@example.com>`
- `/create-document` — then ask for details interactively
