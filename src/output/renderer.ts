import pc from 'picocolors';
import type { GitWtfReport } from '../git/types.js';

export function renderJson(report: GitWtfReport): string {
  const { data, analysis } = report;
  const jsonOutput = {
    isGitRepo: data.isGitRepo,
    branch: data.currentBranch,
    detachedHead: data.detachedHead,
    detachedCommit: data.detachedCommit,
    tracking: data.upstreamBranch,
    hasUpstream: data.hasUpstream,
    ahead: data.ahead,
    behind: data.behind,
    remotes: data.remotes,
    hasCommits: data.hasCommits,
    status: {
      staged: data.files.staged.length + data.files.renamed.length,
      modified: data.files.modified.length,
      deleted: data.files.deleted.length,
      untracked: data.files.untracked.length,
      conflicts: data.files.conflicts.length,
    },
    operations: data.operations,
    stashes: {
      count: data.stashes.count,
      latest: data.stashes.latest,
    },
    recentCommits: data.recentCommits,
    lifecycleState: analysis.state,
    explanation: {
      headline: analysis.headline,
      headlines: [analysis.headline],
      details: analysis.explanations,
    },
    suggestedActionExplanation: analysis.suggestedActionExplanation,
    suggestedCommands: analysis.suggestedCommands,
  };

  return JSON.stringify(jsonOutput, null, 2);
}

export function renderTerminal(report: GitWtfReport, options: { verbose?: boolean } = {}): string {
  const { data, analysis } = report;
  const lines: string[] = [];

  // Title
  lines.push('');
  lines.push(`${pc.bold(pc.cyan('GIT WTF'))}`);

  // 1. Identity & Branch Section
  lines.push('');
  lines.push(pc.bold('Branch'));

  if (data.detachedHead) {
    lines.push(`  ${pc.yellow(`HEAD detached at ${data.detachedCommit || 'unknown'}`)}`);
  } else if (data.currentBranch) {
    lines.push(`  ${pc.bold(data.currentBranch)}`);
  } else {
    lines.push(`  ${pc.dim('(no branch)')}`);
  }

  // Branch tracking / status lines
  if (data.hasUpstream) {
    if (data.ahead === 0 && data.behind === 0) {
      lines.push(`  ${pc.green('✓')} synchronized with ${data.upstreamBranch}`);
    } else {
      if (data.ahead > 0) {
        lines.push(`  ${pc.green('↑')} ${data.ahead} local commit${data.ahead === 1 ? '' : 's'}`);
      }
      if (data.behind > 0) {
        lines.push(`  ${pc.yellow('↓')} ${data.behind} remote commit${data.behind === 1 ? '' : 's'}`);
      }
    }
  } else if (!data.detachedHead && data.currentBranch) {
    if (data.remotes.length === 0) {
      lines.push(`  ${pc.dim('no remote configured')}`);
    } else {
      lines.push(`  ${pc.dim('untracked local branch')}`);
    }
  }

  // 2. Special Operations (if active)
  const isSpecialOp = Object.values(data.operations).some(Boolean);
  if (isSpecialOp) {
    lines.push('');
    lines.push(pc.bold('Operation in progress'));
    if (data.operations.merge) lines.push(`  ${pc.red('●')} Merge in progress`);
    if (data.operations.rebase) lines.push(`  ${pc.yellow('●')} Rebase in progress`);
    if (data.operations.cherryPick) lines.push(`  ${pc.magenta('●')} Cherry-pick in progress`);
    if (data.operations.revert) lines.push(`  ${pc.magenta('●')} Revert in progress`);
    if (data.operations.bisect) lines.push(`  ${pc.blue('●')} Bisect in progress`);
  }

  // 3. Conflicts (Highly prominent)
  const conflictCount = data.files.conflicts.length;
  if (conflictCount > 0) {
    lines.push('');
    lines.push(pc.bold(pc.red('Conflicts')));
    lines.push(`  ${pc.red('✕')} ${conflictCount} unresolved file${conflictCount === 1 ? '' : 's'}`);

    // If few conflicts (<= 5) or verbose, list them
    const showConflicts = options.verbose ? data.files.conflicts : data.files.conflicts.slice(0, 5);
    for (const c of showConflicts) {
      lines.push(`    ${pc.red(c.path)}`);
    }
    if (!options.verbose && conflictCount > 5) {
      lines.push(`    ${pc.dim(`... and ${conflictCount - 5} more (use --verbose to see all)`)}`);
    }
  }

  // 4. Working Tree
  const stagedCount = data.files.staged.length + data.files.renamed.length;
  const modifiedCount = data.files.modified.length;
  const deletedCount = data.files.deleted.length;
  const untrackedCount = data.files.untracked.length;
  const hasWorkingTreeChanges = stagedCount > 0 || modifiedCount > 0 || deletedCount > 0 || untrackedCount > 0;
  const hasDirtyWorkingTree = stagedCount > 0 || modifiedCount > 0;

  lines.push('');
  lines.push(pc.bold('Working tree'));
  if (!hasWorkingTreeChanges && conflictCount === 0) {
    lines.push(`  ${pc.green('✓')} clean`);
  } else {
    if (stagedCount > 0) {
      lines.push(`  ${pc.green('✓')} ${stagedCount} staged`);
    }
    if (modifiedCount > 0) {
      lines.push(`  ${pc.yellow('⚠')} ${modifiedCount} modified`);
    }
    if (deletedCount > 0) {
      lines.push(`  ${pc.red('-')} ${deletedCount} deleted`);
    }
    if (untrackedCount > 0) {
      lines.push(`  ${pc.dim('+')} ${untrackedCount} untracked`);
    }
  }

  // 5. Stashes (Omit entirely when 0)
  if (data.stashes.count > 0) {
    lines.push('');
    lines.push(pc.bold('Stashes'));
    lines.push(`  ${data.stashes.count} stash${data.stashes.count === 1 ? '' : 'es'}`);
    if (data.stashes.latest) {
      lines.push(`  ${pc.dim(`latest: ${data.stashes.latest}`)}`);
    }
  }

  // 6. Recent commits (only show if verbose or if repository is clean/diverged to keep default compact)
  // Show at most 3 with concise columns
  if (options.verbose && data.recentCommits.length > 0) {
    lines.push('');
    lines.push(pc.bold('Recent commits'));
    for (const c of data.recentCommits) {
      lines.push(`  ${pc.yellow(c.hash)}  ${pc.dim(c.relativeTime.padEnd(5))}  ${c.subject}`);
    }
  }

  // 7. Verbose grouped file listing
  if (options.verbose && hasWorkingTreeChanges) {
    lines.push('');
    lines.push(pc.bold('Changes'));

    if (data.files.staged.length > 0 || data.files.renamed.length > 0) {
      lines.push('');
      lines.push(`  ${pc.bold(pc.green('STAGED'))}`);
      for (const f of data.files.staged) {
        const flag = f.stagedKind === 'added' ? 'A' : f.stagedKind === 'deleted' ? 'D' : 'M';
        lines.push(`    ${pc.green(flag)} ${f.path}`);
      }
      for (const f of data.files.renamed) {
        lines.push(`    ${pc.green('R')} ${f.origPath} -> ${f.path}`);
      }
    }

    if (data.files.modified.length > 0) {
      lines.push('');
      lines.push(`  ${pc.bold(pc.yellow('MODIFIED'))}`);
      for (const f of data.files.modified) {
        lines.push(`    ${pc.yellow('M')} ${f.path}`);
      }
    }

    if (data.files.deleted.length > 0) {
      lines.push('');
      lines.push(`  ${pc.bold(pc.red('DELETED'))}`);
      for (const f of data.files.deleted) {
        lines.push(`    ${pc.red('D')} ${f.path}`);
      }
    }

    if (data.files.untracked.length > 0) {
      lines.push('');
      lines.push(`  ${pc.bold(pc.dim('UNTRACKED'))}`);
      for (const f of data.files.untracked) {
        lines.push(`    ${pc.dim('?')} ${f.path}`);
      }
    }

    if (data.files.conflicts.length > 0) {
      lines.push('');
      lines.push(`  ${pc.bold(pc.red('CONFLICTS'))}`);
      for (const f of data.files.conflicts) {
        lines.push(`    ${pc.red('✕')} ${f.path}`);
      }
    }
  }

  // 8. WHAT'S GOING ON (Centerpiece)
  lines.push('');
  lines.push(pc.bold("What's going on"));

  let headlineIcon = pc.cyan('ℹ');
  if (analysis.state === 'clean') headlineIcon = pc.green('✓');
  else if (analysis.state === 'ahead') headlineIcon = pc.green('↑');
  else if (analysis.state === 'behind') headlineIcon = pc.yellow('↓');
  else if (analysis.state === 'conflicted') headlineIcon = pc.red('🔴');
  else if (analysis.state === 'diverged') headlineIcon = hasDirtyWorkingTree ? pc.red('🔴') : pc.yellow('⚠');
  else if (analysis.state === 'modified') headlineIcon = pc.yellow('⚠');
  else if (analysis.state === 'untracked_only') headlineIcon = pc.dim('+');
  else if (analysis.state === 'empty') headlineIcon = pc.blue('★');

  lines.push(`  ${headlineIcon} ${pc.bold(analysis.headline)}`);
  lines.push('');
  for (const exp of analysis.explanations) {
    lines.push(`  ${exp}`);
  }

  // 9. SUGGESTED NEXT STEP
  if (analysis.suggestedActionExplanation || analysis.suggestedCommands.length > 0) {
    lines.push('');
    lines.push(pc.bold('Suggested next step'));
    if (analysis.suggestedActionExplanation) {
      lines.push(`  ${pc.dim('→')} ${analysis.suggestedActionExplanation}`);
      if (analysis.suggestedCommands.length > 0) {
        lines.push('');
      }
    }
    for (const cmd of analysis.suggestedCommands) {
      if (cmd.startsWith('git ')) {
        lines.push(`  ${pc.green('$')} ${pc.bold(cmd)}`);
      } else {
        lines.push(`  ${pc.dim('•')} ${cmd}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
