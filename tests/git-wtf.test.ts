import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { collectGitData } from '../src/git/collector.js';
import { analyzeGitState } from '../src/analysis/interpreter.js';
import { renderJson, renderTerminal } from '../src/output/renderer.js';

function gitCmd(args: string[], cwd: string) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Git WTF Tester',
      GIT_AUTHOR_EMAIL: 'tester@git-wtf.local',
      GIT_COMMITTER_NAME: 'Git WTF Tester',
      GIT_COMMITTER_EMAIL: 'tester@git-wtf.local',
    },
  });
  if (res.error) throw res.error;
  return res;
}

describe('git-wtf comprehensive test suite (Pass 2)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on Windows file lock
    }
  });

  // 15. Outside Git repo
  it('15. handles running outside Git repository', () => {
    const data = collectGitData(tempDir);
    expect(data.isGitRepo).toBe(false);
    const analysis = analyzeGitState(data);
    expect(analysis.headline).toContain('Not inside a Git repository');
    expect(analysis.suggestedCommands).toContain('git init');
  });

  // 13. Empty repository
  it('13. handles empty repository (no commits yet)', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    const data = collectGitData(tempDir);
    expect(data.isGitRepo).toBe(true);
    expect(data.hasCommits).toBe(false);
    expect(data.currentBranch).toBe('main');

    const analysis = analyzeGitState(data);
    expect(analysis.state).toBe('empty');
    expect(analysis.headline).toContain('no commits yet');
  });

  // 1. Clean + Upstream
  it('1. clean + upstream synchronized', () => {
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-rem-'));
    try {
      gitCmd(['init', '--bare', '-b', 'main'], remoteDir);
      gitCmd(['init', '-b', 'main'], tempDir);
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Hello\n');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'initial'], tempDir);
      gitCmd(['remote', 'add', 'origin', remoteDir], tempDir);
      gitCmd(['push', '-u', 'origin', 'main'], tempDir);

      const data = collectGitData(tempDir);
      expect(data.hasUpstream).toBe(true);
      expect(data.ahead).toBe(0);
      expect(data.behind).toBe(0);

      const analysis = analyzeGitState(data);
      expect(analysis.state).toBe('clean');
      expect(analysis.headline).toContain('Everything looks good');
      expect(analysis.explanations[0]).toContain('synchronized with origin/main');
      expect(analysis.suggestedCommands.length).toBe(0);
    } finally {
      try { fs.rmSync(remoteDir, { recursive: true, force: true }); } catch {}
    }
  });

  // 2. Clean + no upstream + origin exists
  it('2. clean + no upstream + origin exists', () => {
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-rem-'));
    try {
      gitCmd(['init', '--bare', '-b', 'main'], remoteDir);
      gitCmd(['init', '-b', 'feature/auth'], tempDir);
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Auth\n');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'feat auth'], tempDir);
      gitCmd(['remote', 'add', 'origin', remoteDir], tempDir);

      const data = collectGitData(tempDir);
      expect(data.hasUpstream).toBe(false);
      expect(data.hasOrigin).toBe(true);

      const analysis = analyzeGitState(data);
      expect(analysis.state).toBe('clean');
      expect(analysis.headline).toContain('isn\'t tracking a remote branch');
      expect(analysis.suggestedCommands).toContain('git push -u origin feature/auth');
    } finally {
      try { fs.rmSync(remoteDir, { recursive: true, force: true }); } catch {}
    }
  });

  // 3. Clean + no remote configured
  it('3. clean + no remote configured', () => {
    gitCmd(['init', '-b', 'local-only'], tempDir);
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content\n');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'initial local'], tempDir);

    const data = collectGitData(tempDir);
    expect(data.remotes.length).toBe(0);

    const analysis = analyzeGitState(data);
    expect(analysis.state).toBe('clean');
    expect(analysis.headline).toContain('No remote is configured');
    expect(analysis.suggestedCommands).toContain('git remote add origin <url>');
  });

  // 4. Ahead + clean
  it('4. ahead + clean', () => {
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-rem-'));
    try {
      gitCmd(['init', '--bare', '-b', 'main'], remoteDir);
      gitCmd(['init', '-b', 'main'], tempDir);
      fs.writeFileSync(path.join(tempDir, 'README.md'), 'v1');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'Initial commit'], tempDir);
      gitCmd(['remote', 'add', 'origin', remoteDir], tempDir);
      gitCmd(['push', '-u', 'origin', 'main'], tempDir);

      fs.writeFileSync(path.join(tempDir, 'c1.txt'), '1');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'Commit 1'], tempDir);

      const data = collectGitData(tempDir);
      expect(data.ahead).toBe(1);
      expect(data.behind).toBe(0);

      const analysis = analyzeGitState(data);
      expect(analysis.state).toBe('ahead');
      expect(analysis.headline).toContain("You're 1 commit ahead of origin/main");
      expect(analysis.suggestedCommands).toContain('git push');
    } finally {
      try { fs.rmSync(remoteDir, { recursive: true, force: true }); } catch {}
    }
  });

  // 5. Behind + clean
  it('5. behind + clean', () => {
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-rem-'));
    const peerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-peer-'));
    try {
      gitCmd(['init', '--bare', '-b', 'main'], remoteDir);
      gitCmd(['init', '-b', 'main'], tempDir);
      fs.writeFileSync(path.join(tempDir, 'README.md'), 'v1');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'Initial commit'], tempDir);
      gitCmd(['remote', 'add', 'origin', remoteDir], tempDir);
      gitCmd(['push', '-u', 'origin', 'main'], tempDir);

      // Peer pushes
      gitCmd(['clone', remoteDir, peerDir], peerDir);
      fs.writeFileSync(path.join(peerDir, 'peer.txt'), 'peer');
      gitCmd(['add', '.'], peerDir);
      gitCmd(['commit', '-m', 'peer'], peerDir);
      gitCmd(['push', 'origin', 'main'], peerDir);

      // Fetch
      gitCmd(['fetch', 'origin'], tempDir);

      const data = collectGitData(tempDir);
      expect(data.behind).toBe(1);
      expect(data.ahead).toBe(0);

      const analysis = analyzeGitState(data);
      expect(analysis.state).toBe('behind');
      expect(analysis.headline).toContain("You're 1 commit behind origin/main");
      expect(analysis.suggestedCommands).toContain('git pull');
    } finally {
      try { fs.rmSync(remoteDir, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(peerDir, { recursive: true, force: true }); } catch {}
    }
  });

  // 6. Diverged + clean
  it('6. diverged + clean working tree', () => {
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-rem-'));
    const peerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-peer-'));
    try {
      gitCmd(['init', '--bare', '-b', 'main'], remoteDir);
      gitCmd(['init', '-b', 'main'], tempDir);
      fs.writeFileSync(path.join(tempDir, 'README.md'), 'v1');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'Initial commit'], tempDir);
      gitCmd(['remote', 'add', 'origin', remoteDir], tempDir);
      gitCmd(['push', '-u', 'origin', 'main'], tempDir);

      // Peer commit
      gitCmd(['clone', remoteDir, peerDir], peerDir);
      fs.writeFileSync(path.join(peerDir, 'peer.txt'), 'from peer');
      gitCmd(['add', '.'], peerDir);
      gitCmd(['commit', '-m', 'Peer commit'], peerDir);
      gitCmd(['push', 'origin', 'main'], peerDir);

      // Local commit
      fs.writeFileSync(path.join(tempDir, 'local.txt'), 'from local');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'Local commit'], tempDir);

      gitCmd(['fetch', 'origin'], tempDir);

      const data = collectGitData(tempDir);
      expect(data.ahead).toBe(1);
      expect(data.behind).toBe(1);

      const analysis = analyzeGitState(data);
      expect(analysis.state).toBe('diverged');
      expect(analysis.headline).toContain('Your branch has diverged from origin/main');
      expect(analysis.suggestedCommands).toContain('git log --oneline --left-right HEAD...@{upstream}');
    } finally {
      try { fs.rmSync(remoteDir, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(peerDir, { recursive: true, force: true }); } catch {}
    }
  });

  // 7. Diverged + dirty
  it('7. diverged + dirty working tree', () => {
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-rem-'));
    const peerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wtf-peer-'));
    try {
      gitCmd(['init', '--bare', '-b', 'main'], remoteDir);
      gitCmd(['init', '-b', 'main'], tempDir);
      fs.writeFileSync(path.join(tempDir, 'README.md'), 'v1');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'Initial commit'], tempDir);
      gitCmd(['remote', 'add', 'origin', remoteDir], tempDir);
      gitCmd(['push', '-u', 'origin', 'main'], tempDir);

      // Peer commit
      gitCmd(['clone', remoteDir, peerDir], peerDir);
      fs.writeFileSync(path.join(peerDir, 'peer.txt'), 'peer');
      gitCmd(['add', '.'], peerDir);
      gitCmd(['commit', '-m', 'peer'], peerDir);
      gitCmd(['push', 'origin', 'main'], peerDir);

      // Local commit
      fs.writeFileSync(path.join(tempDir, 'local.txt'), 'local');
      gitCmd(['add', '.'], tempDir);
      gitCmd(['commit', '-m', 'local'], tempDir);

      // Dirty change in working tree
      fs.writeFileSync(path.join(tempDir, 'README.md'), 'v1 modified dirty');

      gitCmd(['fetch', 'origin'], tempDir);

      const data = collectGitData(tempDir);
      expect(data.ahead).toBe(1);
      expect(data.behind).toBe(1);
      expect(data.files.modified.length).toBe(1);

      const analysis = analyzeGitState(data);
      expect(analysis.state).toBe('diverged');
      expect(analysis.headline).toContain('Your branch has diverged AND your working tree has changes');
      expect(analysis.suggestedCommands).toContain('git stash');
    } finally {
      try { fs.rmSync(remoteDir, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(peerDir, { recursive: true, force: true }); } catch {}
    }
  });

  // 8. Staged + unstaged (split)
  it('8. staged + unstaged changes split', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), '1');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'c1'], tempDir);

    fs.writeFileSync(path.join(tempDir, 'staged.txt'), 'staged');
    gitCmd(['add', 'staged.txt'], tempDir);

    fs.writeFileSync(path.join(tempDir, 'file1.txt'), '1 modified');

    const data = collectGitData(tempDir);
    expect(data.files.staged.length).toBe(1);
    expect(data.files.modified.length).toBe(1);

    const analysis = analyzeGitState(data);
    expect(analysis.state).toBe('modified');
    expect(analysis.headline).toContain('Your changes are split between two states');
    expect(analysis.suggestedCommands).toContain('git commit');
  });

  // 9. Untracked only
  it('9. untracked files only', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'tracked');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'c1'], tempDir);

    fs.writeFileSync(path.join(tempDir, 'untracked.txt'), 'secret');

    const data = collectGitData(tempDir);
    expect(data.files.untracked.length).toBe(1);

    const analysis = analyzeGitState(data);
    expect(analysis.state).toBe('untracked_only');
    expect(analysis.headline).toContain('You have 1 untracked file');
    expect(analysis.suggestedActionExplanation).toContain('Review untracked files');
  });

  // 10. Merge conflict
  it('10. handles merge conflict', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    const file = path.join(tempDir, 'conflict.txt');
    fs.writeFileSync(file, 'line 1\n');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'base'], tempDir);

    gitCmd(['checkout', '-b', 'branch-a'], tempDir);
    fs.writeFileSync(file, 'line 1 - edited by A\n');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'change from branch A'], tempDir);

    gitCmd(['checkout', 'main'], tempDir);
    fs.writeFileSync(file, 'line 1 - edited by Main\n');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'change from main'], tempDir);

    gitCmd(['merge', 'branch-a'], tempDir);

    const data = collectGitData(tempDir);
    expect(data.operations.merge).toBe(true);
    expect(data.files.conflicts.length).toBe(1);

    const analysis = analyzeGitState(data);
    expect(analysis.state).toBe('conflicted');
    expect(analysis.headline).toContain('A merge is currently in progress');
    expect(analysis.explanations.some(e => e.includes('1 file contains unresolved conflicts'))).toBe(true);
  });

  // 11. Rebase conflict
  it('11. handles rebase conflict', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    const file = path.join(tempDir, 'file.txt');
    fs.writeFileSync(file, 'original');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'initial'], tempDir);

    gitCmd(['checkout', '-b', 'feature'], tempDir);
    fs.writeFileSync(file, 'feature edit');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'feature commit'], tempDir);

    gitCmd(['checkout', 'main'], tempDir);
    fs.writeFileSync(file, 'main edit');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'main commit'], tempDir);

    gitCmd(['checkout', 'feature'], tempDir);
    gitCmd(['rebase', 'main'], tempDir);

    const data = collectGitData(tempDir);
    expect(data.operations.rebase).toBe(true);
    expect(data.files.conflicts.length).toBeGreaterThan(0);

    const analysis = analyzeGitState(data);
    expect(analysis.headline).toContain('A rebase is currently in progress');
    expect(analysis.suggestedCommands).toContain('git rebase --continue');
    expect(analysis.suggestedCommands).toContain('git rebase --abort');
  });

  // 12. Detached HEAD
  it('12. handles detached HEAD', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    fs.writeFileSync(path.join(tempDir, 'f1.txt'), '1');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'commit 1'], tempDir);

    fs.writeFileSync(path.join(tempDir, 'f2.txt'), '2');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'commit 2'], tempDir);

    gitCmd(['checkout', 'HEAD~1'], tempDir);

    const data = collectGitData(tempDir);
    expect(data.detachedHead).toBe(true);

    const analysis = analyzeGitState(data);
    expect(analysis.headline).toContain('HEAD is detached');
    expect(analysis.suggestedCommands).toContain('git switch -c <new-branch-name>');
  });

  // 14. JSON output format
  it('14. handles JSON output correctly', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'first'], tempDir);

    fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');

    const data = collectGitData(tempDir);
    const analysis = analyzeGitState(data);
    const jsonStr = renderJson({ data, analysis });
    const parsed = JSON.parse(jsonStr);

    expect(parsed.isGitRepo).toBe(true);
    expect(parsed.branch).toBe('main');
    expect(parsed.status.untracked).toBe(1);
    expect(parsed.hasCommits).toBe(true);
    expect(parsed.explanation.headline).toBeDefined();
  });

  it('renders clean and verbose terminal output with grouped changes', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    fs.writeFileSync(path.join(tempDir, 'tracked.txt'), 'initial');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'feat: initial commit'], tempDir);

    fs.writeFileSync(path.join(tempDir, 'staged.txt'), 'staged');
    gitCmd(['add', 'staged.txt'], tempDir);

    fs.writeFileSync(path.join(tempDir, 'tracked.txt'), 'modified');
    fs.writeFileSync(path.join(tempDir, 'untracked.txt'), 'untracked');

    const data = collectGitData(tempDir);
    const analysis = analyzeGitState(data);

    // Compact output
    const compactOutput = renderTerminal({ data, analysis }, { verbose: false });
    expect(compactOutput).toContain('GIT WTF');
    expect(compactOutput).toContain('Branch');
    expect(compactOutput).toContain('main');
    expect(compactOutput).toContain("What's going on");
    expect(compactOutput).toContain('Suggested next step');

    // Verbose output with grouped changes
    const verboseOutput = renderTerminal({ data, analysis }, { verbose: true });
    expect(verboseOutput).toContain('Changes');
    expect(verboseOutput).toContain('STAGED');
    expect(verboseOutput).toContain('MODIFIED');
    expect(verboseOutput).toContain('UNTRACKED');
    expect(verboseOutput).toContain('Recent commits');
  });

  it('16. handles special characters, unicode, spaces, and brackets in filenames', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    const spaceFile = path.join(tempDir, 'file with spaces.txt');
    const quoteFile = path.join(tempDir, "file'quote'name.txt");
    const unicodeFile = path.join(tempDir, 'üñîçødé-文件.txt');

    fs.writeFileSync(spaceFile, 'spaces');
    fs.writeFileSync(quoteFile, 'quotes');
    fs.writeFileSync(unicodeFile, 'unicode');

    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'special names commit'], tempDir);

    // Modify one and add a new special file
    fs.writeFileSync(spaceFile, 'spaces modified');
    const anotherSpecial = path.join(tempDir, 'dollar$semi;amp&.txt');
    fs.writeFileSync(anotherSpecial, 'special');

    const data = collectGitData(tempDir);
    expect(data.isGitRepo).toBe(true);
    expect(data.files.modified.length).toBe(1);
    expect(data.files.modified[0].path).toBe('file with spaces.txt');
    expect(data.files.untracked.length).toBe(1);
    expect(data.files.untracked[0].path).toBe('dollar$semi;amp&.txt');
  });

  it('17. handles invocation from nested subdirectories', () => {
    gitCmd(['init', '-b', 'main'], tempDir);
    const subDir = path.join(tempDir, 'src', 'deep', 'nested');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'root.txt'), 'root');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'root commit'], tempDir);

    fs.writeFileSync(path.join(subDir, 'child.txt'), 'nested content');

    const data = collectGitData(subDir);
    expect(data.isGitRepo).toBe(true);
    expect(data.currentBranch).toBe('main');
    expect(data.files.untracked.length).toBe(1);
  });

  it('18. handles long branch names cleanly without crash', () => {
    const longBranch = 'feature/JIRA-12345-very-long-descriptive-branch-name-that-developers-create-for-complex-tickets';
    gitCmd(['init', '-b', longBranch], tempDir);
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content');
    gitCmd(['add', '.'], tempDir);
    gitCmd(['commit', '-m', 'feat: long branch test'], tempDir);

    const data = collectGitData(tempDir);
    const analysis = analyzeGitState(data);
    const output = renderTerminal({ data, analysis });
    expect(output).toContain(longBranch);
    expect(output).toContain("What's going on");
  });

  it('19. handles linked git worktree directory layout', () => {
    const mainRepo = path.join(tempDir, 'main-repo');
    const worktreeRepo = path.join(tempDir, 'wt-repo');
    fs.mkdirSync(mainRepo, { recursive: true });

    gitCmd(['init', '-b', 'main'], mainRepo);
    fs.writeFileSync(path.join(mainRepo, 'file.txt'), 'content');
    gitCmd(['add', '.'], mainRepo);
    gitCmd(['commit', '-m', 'initial'], mainRepo);

    // Create linked worktree
    gitCmd(['worktree', 'add', '-b', 'branch-wt', worktreeRepo], mainRepo);

    const data = collectGitData(worktreeRepo);
    expect(data.isGitRepo).toBe(true);
    expect(data.currentBranch).toBe('branch-wt');
    expect(data.hasCommits).toBe(true);
  });
});
