import fs from 'node:fs';
import path from 'node:path';
import { execGit } from './exec.js';
import type {
  RawGitData,
  ChangedFile,
  CommitInfo,
  StashInfo,
  SpecialOperationState,
} from './types.js';

export function collectGitData(cwd: string = process.cwd()): RawGitData {
  // 1. Check if inside a git repository
  const revParse = execGit(['rev-parse', '--is-inside-work-tree', '--git-dir'], cwd);
  if (!revParse.success) {
    return {
      isGitRepo: false,
      currentBranch: null,
      detachedHead: false,
      upstreamBranch: null,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      remotes: [],
      hasOrigin: false,
      hasCommits: false,
      files: {
        staged: [],
        modified: [],
        deleted: [],
        untracked: [],
        renamed: [],
        conflicts: [],
      },
      stashes: { count: 0 },
      recentCommits: [],
      operations: {
        merge: false,
        rebase: false,
        cherryPick: false,
        revert: false,
        bisect: false,
      },
    };
  }

  const lines = revParse.stdout.trim().split(/\r?\n/);
  const gitDirRelOrAbs = lines[lines.length - 1];
  const gitDir = path.isAbsolute(gitDirRelOrAbs)
    ? gitDirRelOrAbs
    : path.resolve(cwd, gitDirRelOrAbs);

  // 2. Check current branch & detached HEAD
  let currentBranch: string | null = null;
  let detachedHead = false;
  let detachedCommit: string | undefined;

  const branchRes = execGit(['symbolic-ref', '--short', '-q', 'HEAD'], cwd);
  if (branchRes.success && branchRes.stdout.trim()) {
    currentBranch = branchRes.stdout.trim();
  } else {
    // Detached HEAD or empty repo or error
    detachedHead = true;
    const headCommitRes = execGit(['rev-parse', '--short', 'HEAD'], cwd);
    if (headCommitRes.success && headCommitRes.stdout.trim()) {
      detachedCommit = headCommitRes.stdout.trim();
    }
  }

  // 3. Check if repo has commits
  const hasCommitsRes = execGit(['rev-parse', '--verify', 'HEAD'], cwd);
  const hasCommits = hasCommitsRes.success;

  // If detached HEAD but no commits, branch could be default (e.g. init repo)
  if (!hasCommits && !currentBranch) {
    const symbolicRefAll = execGit(['symbolic-ref', 'HEAD'], cwd);
    if (symbolicRefAll.success) {
      currentBranch = symbolicRefAll.stdout.trim().replace(/^refs\/heads\//, '');
      detachedHead = false;
    }
  }

  // 4. Remotes inspection
  const remotesRes = execGit(['remote'], cwd);
  const remotes = remotesRes.success && remotesRes.stdout.trim()
    ? remotesRes.stdout.trim().split(/\r?\n/).map(r => r.trim()).filter(Boolean)
    : [];
  const hasOrigin = remotes.includes('origin');

  // 5. Remote upstream tracking & ahead/behind
  let upstreamBranch: string | null = null;
  let hasUpstream = false;
  let ahead = 0;
  let behind = 0;

  if (currentBranch) {
    const upstreamRes = execGit(['rev-parse', '--abbrev-ref', '@{upstream}'], cwd);
    if (upstreamRes.success && upstreamRes.stdout.trim()) {
      upstreamBranch = upstreamRes.stdout.trim();
      hasUpstream = true;

      const countRes = execGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd);
      if (countRes.success && countRes.stdout.trim()) {
        const parts = countRes.stdout.trim().split(/\s+/);
        if (parts.length >= 2) {
          ahead = parseInt(parts[0], 10) || 0;
          behind = parseInt(parts[1], 10) || 0;
        }
      }
    }
  }

  // 6. Working tree files (using git status --porcelain=v1 -z to handle spaces/quotes/renames cleanly)
  const statusRes = execGit(['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd);
  const staged: ChangedFile[] = [];
  const modified: ChangedFile[] = [];
  const deleted: ChangedFile[] = [];
  const untracked: ChangedFile[] = [];
  const renamed: ChangedFile[] = [];
  const conflicts: ChangedFile[] = [];

  if (statusRes.success && statusRes.stdout) {
    const rawTokens = statusRes.stdout.split('\0');
    for (let i = 0; i < rawTokens.length; i++) {
      const entry = rawTokens[i];
      if (!entry || entry.length < 3) continue;

      const codeX = entry[0];
      const codeY = entry[1];
      let filePath = entry.substring(3);
      let origPath: string | undefined;

      // In porcelain v1 -z, renames (R or C) have the old path as the next null-separated token
      if (codeX === 'R' || codeX === 'C' || codeY === 'R' || codeY === 'C') {
        if (i + 1 < rawTokens.length) {
          origPath = filePath;
          filePath = rawTokens[++i];
        }
      }

      // Check conflicts: DD, AU, UD, UA, DU, AA, UU, or any U
      const conflictCodes = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'];
      const xy = codeX + codeY;
      if (conflictCodes.includes(xy) || codeX === 'U' || codeY === 'U') {
        conflicts.push({
          path: filePath,
          kind: 'conflict',
          unstagedKind: 'conflict',
        });
        continue;
      }

      // Untracked
      if (codeX === '?' && codeY === '?') {
        untracked.push({
          path: filePath,
          kind: 'untracked',
          unstagedKind: 'untracked',
        });
        continue;
      }

      // Index (staged) status
      if (codeX !== ' ' && codeX !== '?') {
        if (codeX === 'R') {
          renamed.push({
            path: filePath,
            origPath,
            kind: 'renamed',
            stagedKind: 'renamed',
          });
        } else if (codeX === 'A') {
          staged.push({
            path: filePath,
            kind: 'staged',
            stagedKind: 'added',
          });
        } else if (codeX === 'M') {
          staged.push({
            path: filePath,
            kind: 'staged',
            stagedKind: 'modified',
          });
        } else if (codeX === 'D') {
          staged.push({
            path: filePath,
            kind: 'staged',
            stagedKind: 'deleted',
          });
        }
      }

      // Worktree (unstaged) status
      if (codeY !== ' ' && codeY !== '?') {
        if (codeY === 'M') {
          modified.push({
            path: filePath,
            kind: 'modified',
            unstagedKind: 'modified',
          });
        } else if (codeY === 'D') {
          deleted.push({
            path: filePath,
            kind: 'deleted',
            unstagedKind: 'deleted',
          });
        }
      }
    }
  }

  // 7. Special operations (merge, rebase, cherry-pick, revert, bisect)
  const operations: SpecialOperationState = {
    merge: false,
    rebase: false,
    cherryPick: false,
    revert: false,
    bisect: false,
  };

  try {
    if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
      operations.merge = true;
    }
    if (
      fs.existsSync(path.join(gitDir, 'rebase-apply')) ||
      fs.existsSync(path.join(gitDir, 'rebase-merge'))
    ) {
      operations.rebase = true;
    }
    if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) {
      operations.cherryPick = true;
    }
    if (fs.existsSync(path.join(gitDir, 'REVERT_HEAD'))) {
      operations.revert = true;
    }
    if (fs.existsSync(path.join(gitDir, 'BISECT_LOG'))) {
      operations.bisect = true;
    }
  } catch {
    // Ignore file system errors
  }

  // 8. Stashes
  const stashes: StashInfo = { count: 0 };
  const stashRes = execGit(['stash', 'list', '-n', '1'], cwd);
  if (stashRes.success && stashRes.stdout.trim()) {
    const allStashRes = execGit(['stash', 'list'], cwd);
    if (allStashRes.success && allStashRes.stdout.trim()) {
      const stashLines = allStashRes.stdout.trim().split(/\r?\n/);
      stashes.count = stashLines.length;
      stashes.latest = stashLines[0].replace(/^stash@\{\d+\}:\s*/, '');
    }
  }

  // 9. Recent commits (up to 3) with short relative time
  const recentCommits: CommitInfo[] = [];
  if (hasCommits) {
    const logRes = execGit(['log', '-n', '3', '--format=%h%x09%cr%x09%s%x09%an'], cwd);
    if (logRes.success && logRes.stdout.trim()) {
      const logLines = logRes.stdout.trim().split(/\r?\n/);
      for (const line of logLines) {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          // Format relative time concisely, e.g. "10 minutes ago" -> "10m", "2 hours ago" -> "2h", "3 days ago" -> "3d"
          let rel = parts[1].trim();
          rel = rel
            .replace(/(\d+)\s+seconds?\s+ago/, '$1s')
            .replace(/(\d+)\s+minutes?\s+ago/, '$1m')
            .replace(/(\d+)\s+hours?\s+ago/, '$1h')
            .replace(/(\d+)\s+days?\s+ago/, '$1d')
            .replace(/(\d+)\s+weeks?\s+ago/, '$1w')
            .replace(/(\d+)\s+months?\s+ago/, '$1mo')
            .replace(/(\d+)\s+years?\s+ago/, '$1y');

          recentCommits.push({
            hash: parts[0],
            relativeTime: rel,
            subject: parts[2],
            author: parts[3],
          });
        }
      }
    }
  }

  return {
    isGitRepo: true,
    gitDir,
    currentBranch,
    detachedHead,
    detachedCommit,
    upstreamBranch,
    hasUpstream,
    ahead,
    behind,
    remotes,
    hasOrigin,
    hasCommits,
    files: {
      staged,
      modified,
      deleted,
      untracked,
      renamed,
      conflicts,
    },
    stashes,
    recentCommits,
    operations,
  };
}
