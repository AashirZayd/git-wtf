# git-wtf

> The human-friendly Git state interpreter.

Git tells you what changed.  
**`git-wtf` tells you what it means.**

Most Git status commands dump raw file lists and detached flags. `git-wtf` turns raw Git state into a concise, human-friendly explanation of what is actually going on and what you should do next.

```text
GIT WTF

Branch
  main
  ↑ 2 local commits
  ↓ 1 remote commit

Working tree
  ✓ 1 staged
  ⚠ 1 modified
  + 1 untracked

What's going on
  🔴 Your branch has diverged AND your working tree has changes.

  You have 2 local commits and the remote has 1 commit you don't have.
  Working tree: 1 staged, 1 modified, 1 untracked.
  Rebase or pull may be blocked by your uncommitted changes.

Suggested next step
  → Review or stash your working changes before reconciling history.

  $ git stash
  $ git log --oneline --left-right HEAD...@{upstream}
```

---

## Installation

### Primary (npm)

Install globally using npm:

```bash
npm install -g git-wtf
```

Then run inside any Git repository:

```bash
git wtf
```

or directly:

```bash
git-wtf
```

Package details: [npmjs.com/package/git-wtf](https://www.npmjs.com/package/git-wtf)

### From source

You can also build and link `git-wtf` directly from source:

```bash
# 1. Clone the repository
git clone https://github.com/AashirZayd/git-wtf.git
cd git-wtf

# 2. Install dependencies & compile
npm install
npm run build

# 3. Link globally so Git can find it
npm link
```

---

## Why git-wtf?

| `git status` | `git-wtf` |
|---|---|
| Dumps raw file lists and status codes | Explains what state the repository is actually in |
| Shows independent flags in isolation | Analyzes how combined states interact (e.g. diverged + dirty tree) |
| Leaves interpretation to the developer | Identifies why your next action may fail or be blocked |
| Can provoke hasty, destructive commands | Recommends safe inspection before reconciling history |

> **Key Distinction:**  
> `git status` provides the **state**.  
> `git-wtf` provides the **interpretation**.  
> `git-wtf` does not replace `git status` — it explains it.

---

## What git-wtf Understands

- **Clean & Synchronized:** Verifies working tree is clean and up to date with remote tracking.
- **Ahead of Upstream:** Calculates unpushed local commits and suggests pushing.
- **Behind Upstream:** Identifies incoming commits and warns if local changes could conflict.
- **Diverged History:** Explains divergence cleanly; distinguishes between clean diverged branches and diverged branches blocked by dirty working tree changes.
- **Split Working Tree Changes:** Clearly distinguishes staged files ready to commit from unstaged modifications.
- **Untracked Files:** Warns about untracked files and suggests reviewing before adding.
- **Merge Conflicts:** Identifies in-progress merges (`MERGE_HEAD`) and lists unresolved files prominently.
- **Rebase Conflicts:** Detects paused rebases (`rebase-apply`/`rebase-merge`) with `--continue` and `--abort` guidance.
- **Cherry-Pick / Revert / Bisect:** Recognizes ongoing operations and suggests continuation steps.
- **Detached HEAD:** Explains detached commit state without panic and offers safe branch creation commands.
- **Missing Upstream vs. Missing Remote:** Distinguishes between local branches without an upstream tracking branch versus repositories with no remote configured at all.
- **Stashes:** Surfaces stash counts and latest stash notes without cluttering zero-stash outputs.

---

## Options

| Option | Flag | Description |
|---|---|---|
| `--json` | `-j` | Output structured, unstyled JSON for automation and scripts |
| `--verbose` | `-v` | Show grouped file paths (`STAGED`, `MODIFIED`, `UNTRACKED`, `CONFLICTS`) and recent commits |
| `--help` | `-h` | Display help and usage examples |
| `--version` | `-V` | Show current version number (`0.1.0`) |

---

## Example States

### Clean & Synchronized
```text
GIT WTF

Branch
  main
  ✓ synchronized with origin/main

Working tree
  ✓ clean

What's going on
  ✓ Everything looks good.

  Your working tree is clean and your branch is synchronized with origin/main.
```

### Diverged (Clean Working Tree)
```text
GIT WTF

Branch
  feature/auth
  ↑ 3 local commits
  ↓ 1 remote commit

Working tree
  ✓ clean

What's going on
  ⚠ Your branch has diverged from origin/feature/auth.

  You have 3 local commits that haven't been pushed.
  The remote has 1 commit you don't have.

Suggested next step
  → Inspect the divergence before choosing merge or rebase.

  $ git log --oneline --left-right HEAD...@{upstream}
```

### Verbose Mode (`git wtf --verbose`)
```text
GIT WTF

Branch
  feature/auth
  untracked local branch

Working tree
  ✓ 1 staged
  ⚠ 1 modified
  + 1 untracked

Recent commits
  7af3220  2m     fix: token expiration handling
  ae6841c  15m    feat: local auth token cache
  e460104  1h     initial commit

Changes

  STAGED
    A src/session.ts

  MODIFIED
    M README.md

  UNTRACKED
    ? notes.tmp

What's going on
  ⚠ Your changes are split between two states.

  1 file ready to commit.
  1 additional change is not staged.
  1 untracked file present.

Suggested next step
  → Commit your staged changes now, or stage remaining changes first.

  $ git commit
  $ git add <files>
```

---

## Machine-Readable JSON Mode

Run `git wtf --json` to get a structured JSON payload for custom scripts, editor integrations, or CI workflows.

JSON mode emits **only valid JSON to stdout** without ANSI colors, progress spinners, or decorative text.

```json
{
  "isGitRepo": true,
  "branch": "feature/auth",
  "detachedHead": false,
  "tracking": "origin/feature/auth",
  "hasUpstream": true,
  "ahead": 2,
  "behind": 1,
  "remotes": [
    "origin"
  ],
  "hasCommits": true,
  "status": {
    "staged": 1,
    "modified": 1,
    "deleted": 0,
    "untracked": 1,
    "conflicts": 0
  },
  "operations": {
    "merge": false,
    "rebase": false,
    "cherryPick": false,
    "revert": false,
    "bisect": false
  },
  "stashes": {
    "count": 1,
    "latest": "WIP on token caching"
  },
  "recentCommits": [
    {
      "hash": "0db4141",
      "relativeTime": "10m",
      "subject": "feat: initial auth service",
      "author": "Alice"
    }
  ],
  "lifecycleState": "diverged",
  "explanation": {
    "headline": "Your branch has diverged from origin/feature/auth.",
    "headlines": [
      "Your branch has diverged from origin/feature/auth."
    ],
    "details": [
      "You have 2 local commits that haven't been pushed.",
      "The remote has 1 commit you don't have."
    ]
  },
  "suggestedActionExplanation": "Inspect the divergence before choosing merge or rebase.",
  "suggestedCommands": [
    "git log --oneline --left-right HEAD...@{upstream}"
  ]
}
```

---

## Safety & Security Guarantees

- **Advisory Only:** `git-wtf can suggest commands. It does not execute them.` It will never automatically commit, rebase, merge, reset, checkout, clean, or push.
- **Zero Shell Interpolation:** Git commands are executed with direct argument arrays without shell evaluation (`shell: false`). Malicious filenames or branch names cannot inject shell syntax.
- **100% Offline & Private:** Zero network requests, zero telemetry, zero analytics, zero external dependencies besides terminal color formatting.

---

## Offline & Fetch Semantics

`git-wtf` works **entirely offline**:
- Ahead and behind commit calculations reflect the repository's **locally available remote-tracking references** (`refs/remotes/*`).
- `git-wtf` does **not** connect to GitHub, GitLab, or remote servers.
- If your remote-tracking references have not been fetched recently, the remote status reflects your last fetch. Run `git fetch` whenever you want to update local tracking references from the remote server.

---

## Limitations

- **No Automatic Remote Fetch:** In order to stay 100% offline, fast, and safe, `git-wtf` never fetches remote data over the network.
- **Submodule Traversal:** Top-level submodule modifications appear in the status count, but nested submodule commits are not recursively traversed in v0.1.0.
- **Non-Destructive by Design:** `git-wtf` explains and recommends; it does not repair or change your Git state automatically.

---

## Development & Testing

```bash
# Compile TypeScript to dist/
npm run build

# Run local development execution via tsx
npm run dev

# Run Vitest test suite (20 automated tests using isolated temporary Git repositories)
npm test

# Verify package tarball contents
npm pack --dry-run
```

---

## License

[MIT](LICENSE)
