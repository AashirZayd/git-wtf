import type { RawGitData, GitWtfAnalysis, RepoLifecycleState } from '../git/types.js';

export function analyzeGitState(data: RawGitData): GitWtfAnalysis {
  // 1. Not a git repository
  if (!data.isGitRepo) {
    return {
      state: 'clean',
      headline: 'Not inside a Git repository.',
      explanations: ['git-wtf must be run inside a Git repository.'],
      suggestedActionExplanation: 'Initialize a new repository to start tracking changes.',
      suggestedCommands: ['git init'],
    };
  }

  // 2. Empty repository (no commits yet)
  if (!data.hasCommits) {
    const stagedCount = data.files.staged.length + data.files.renamed.length;
    const unstagedCount = data.files.modified.length + data.files.deleted.length;
    const untrackedCount = data.files.untracked.length;

    if (stagedCount === 0 && unstagedCount === 0 && untrackedCount === 0) {
      return {
        state: 'empty',
        headline: 'This repository has no commits yet.',
        explanations: ['The repository is completely empty.'],
        suggestedActionExplanation: 'Create or add files to make your initial commit.',
        suggestedCommands: ['git add <files>', 'git commit -m "Initial commit"'],
      };
    }

    if (stagedCount > 0 && unstagedCount === 0 && untrackedCount === 0) {
      return {
        state: 'empty',
        headline: `Ready for your initial commit (${stagedCount} file${stagedCount === 1 ? '' : 's'} staged).`,
        explanations: ['You have staged files for your first commit.'],
        suggestedActionExplanation: 'Commit your staged changes to establish the repository history.',
        suggestedCommands: ['git commit -m "Initial commit"'],
      };
    }

    return {
      state: 'empty',
      headline: 'This repository has no commits yet.',
      explanations: ['You have files waiting to be tracked and committed.'],
      suggestedActionExplanation: 'Stage the files and create the first commit.',
      suggestedCommands: ['git add <files>', 'git commit -m "Initial commit"'],
    };
  }

  // File counts
  const stagedCount = data.files.staged.length + data.files.renamed.length;
  const unstagedCount = data.files.modified.length + data.files.deleted.length;
  const untrackedCount = data.files.untracked.length;
  const conflictCount = data.files.conflicts.length;
  const hasDirtyWorkingTree = stagedCount > 0 || unstagedCount > 0;

  // 3. Special operations & conflicts (HIGHEST PRIORITY)
  const isSpecialOp = Object.values(data.operations).some(Boolean);
  if (isSpecialOp || conflictCount > 0) {
    if (data.operations.merge) {
      if (conflictCount > 0) {
        return {
          state: 'conflicted',
          headline: 'A merge is currently in progress.',
          explanations: [
            `${conflictCount} file${conflictCount === 1 ? '' : 's'} ${conflictCount === 1 ? 'contains' : 'contain'} unresolved conflicts.`,
            'Resolve the conflicts, stage the resolved files, then complete the merge.',
          ],
          suggestedActionExplanation: 'Inspect conflict status, resolve marked files, and commit.',
          suggestedCommands: ['git status', 'git commit'],
        };
      } else {
        return {
          state: 'conflicted',
          headline: 'A merge is currently in progress.',
          explanations: [
            'All conflicts have been resolved and changes are staged.',
            'Ready to conclude the merge.',
          ],
          suggestedActionExplanation: 'Commit to conclude the merge.',
          suggestedCommands: ['git commit'],
        };
      }
    }

    if (data.operations.rebase) {
      if (conflictCount > 0) {
        return {
          state: 'conflicted',
          headline: 'A rebase is currently in progress.',
          explanations: [
            `${conflictCount} file${conflictCount === 1 ? '' : 's'} have conflicts blocking the rebase.`,
            'Resolve conflicts and stage the results to continue, or abort to return to the previous state.',
          ],
          suggestedActionExplanation: 'Resolve conflicts, stage them, then continue or abort the rebase.',
          suggestedCommands: ['git status', 'git rebase --continue', 'git rebase --abort'],
        };
      } else {
        return {
          state: 'conflicted',
          headline: 'A rebase is currently in progress.',
          explanations: ['Ready to continue rebase.'],
          suggestedActionExplanation: 'Continue applying commits.',
          suggestedCommands: ['git rebase --continue', 'git rebase --abort'],
        };
      }
    }

    if (data.operations.cherryPick) {
      return {
        state: 'conflicted',
        headline: 'A cherry-pick is currently in progress.',
        explanations: [
          conflictCount > 0
            ? `${conflictCount} file${conflictCount === 1 ? '' : 's'} contain conflicts.`
            : 'Changes from cherry-pick are ready.',
        ],
        suggestedActionExplanation: 'Resolve any conflicts and continue cherry-picking, or abort.',
        suggestedCommands: ['git cherry-pick --continue', 'git cherry-pick --abort'],
      };
    }

    if (data.operations.revert) {
      return {
        state: 'conflicted',
        headline: 'A revert is currently in progress.',
        explanations: [
          conflictCount > 0
            ? `${conflictCount} file${conflictCount === 1 ? '' : 's'} contain conflicts.`
            : 'Changes from revert are ready.',
        ],
        suggestedActionExplanation: 'Resolve any conflicts and continue the revert, or abort.',
        suggestedCommands: ['git revert --continue', 'git revert --abort'],
      };
    }

    if (data.operations.bisect) {
      return {
        state: 'special_op',
        headline: 'A bisect is currently in progress.',
        explanations: ['Git is searching for the commit that introduced a bug.'],
        suggestedActionExplanation: 'Mark the current commit as good or bad, or reset bisect.',
        suggestedCommands: ['git bisect good', 'git bisect bad', 'git bisect reset'],
      };
    }

    // Unresolved conflicts without special operation file marker
    if (conflictCount > 0) {
      return {
        state: 'conflicted',
        headline: `${conflictCount} file${conflictCount === 1 ? '' : 's'} contain unresolved conflicts.`,
        explanations: [
          'Conflicted files must be resolved before proceeding.',
        ],
        suggestedActionExplanation: 'Review conflicted files and resolve them.',
        suggestedCommands: ['git status'],
      };
    }
  }

  // 4. Detached HEAD
  if (data.detachedHead) {
    const commitStr = data.detachedCommit || 'current commit';
    const explanations = [
      `You're currently at commit ${commitStr} rather than on a branch.`,
      'New commits can become difficult to reach after switching away.',
    ];
    if (stagedCount > 0 || unstagedCount > 0) {
      explanations.push(`You also have uncommitted changes in your working tree.`);
    }
    return {
      state: 'modified',
      headline: 'HEAD is detached.',
      explanations,
      suggestedActionExplanation: 'Create a new branch to keep your work reachable.',
      suggestedCommands: ['git switch -c <new-branch-name>'],
    };
  }

  // 5. Diverged Branch (ahead > 0 && behind > 0)
  if (data.hasUpstream && data.ahead > 0 && data.behind > 0) {
    if (hasDirtyWorkingTree) {
      // CASE E: Diverged + dirty working tree
      const dirtyParts: string[] = [];
      if (stagedCount > 0) dirtyParts.push(`${stagedCount} staged`);
      if (unstagedCount > 0) dirtyParts.push(`${unstagedCount} modified`);
      if (untrackedCount > 0) dirtyParts.push(`${untrackedCount} untracked`);

      return {
        state: 'diverged',
        headline: 'Your branch has diverged AND your working tree has changes.',
        explanations: [
          `You have ${data.ahead} local commit${data.ahead === 1 ? '' : 's'} and the remote has ${data.behind} commit${data.behind === 1 ? '' : 's'} you don't have.`,
          `Working tree: ${dirtyParts.join(', ')}.`,
          'Rebase or pull may be blocked by your uncommitted changes.',
        ],
        suggestedActionExplanation: 'Review or stash your working changes before reconciling history.',
        suggestedCommands: ['git stash', `git log --oneline --left-right HEAD...@{upstream}`],
      };
    } else {
      // CASE D: Diverged + clean working tree
      return {
        state: 'diverged',
        headline: `Your branch has diverged from ${data.upstreamBranch}.`,
        explanations: [
          `You have ${data.ahead} local commit${data.ahead === 1 ? '' : 's'} that haven't been pushed.`,
          `The remote has ${data.behind} commit${data.behind === 1 ? '' : 's'} you don't have.`,
        ],
        suggestedActionExplanation: 'Inspect the divergence before choosing merge or rebase.',
        suggestedCommands: ['git log --oneline --left-right HEAD...@{upstream}'],
      };
    }
  }

  // 6. Ahead of upstream only
  if (data.hasUpstream && data.ahead > 0 && data.behind === 0) {
    const explanations = [
      'Your local commits haven\'t been pushed yet.',
    ];
    if (stagedCount > 0 || unstagedCount > 0) {
      explanations.push('You also have uncommitted changes in your working tree.');
    }
    return {
      state: 'ahead',
      headline: `You're ${data.ahead} commit${data.ahead === 1 ? '' : 's'} ahead of ${data.upstreamBranch}.`,
      explanations,
      suggestedActionExplanation: 'Push your commits to update the remote branch.',
      suggestedCommands: ['git push'],
    };
  }

  // 7. Behind upstream only
  if (data.hasUpstream && data.behind > 0 && data.ahead === 0) {
    const explanations = [
      'The remote has commits you don\'t have locally.',
    ];
    if (hasDirtyWorkingTree) {
      explanations.push('You have uncommitted local changes that might conflict with incoming commits.');
      return {
        state: 'behind',
        headline: `You're ${data.behind} commit${data.behind === 1 ? '' : 's'} behind ${data.upstreamBranch}.`,
        explanations,
        suggestedActionExplanation: 'Review or stash your working changes before pulling.',
        suggestedCommands: ['git stash', 'git pull'],
      };
    }
    return {
      state: 'behind',
      headline: `You're ${data.behind} commit${data.behind === 1 ? '' : 's'} behind ${data.upstreamBranch}.`,
      explanations,
      suggestedActionExplanation: 'Pull remote changes into your local branch.',
      suggestedCommands: ['git pull'],
    };
  }

  // 8. No upstream branch configured
  if (!data.hasUpstream && data.currentBranch) {
    // If working tree has changes, address changes or upstream
    if (stagedCount === 0 && unstagedCount === 0 && untrackedCount === 0) {
      // Clean working tree, but no upstream
      if (data.remotes.length === 0) {
        // CASE: Clean + no remote
        return {
          state: 'clean',
          headline: 'Working tree is clean. No remote is configured for this repository.',
          explanations: [
            `Branch "${data.currentBranch}" is purely local.`,
            'No remote repository has been added yet.',
          ],
          suggestedActionExplanation: 'Add a remote when you are ready to publish.',
          suggestedCommands: ['git remote add origin <url>'],
        };
      }

      // CASE: Clean + no upstream + origin exists
      const targetRemote = data.hasOrigin ? 'origin' : data.remotes[0];
      return {
        state: 'clean',
        headline: `Branch "${data.currentBranch}" isn't tracking a remote branch.`,
        explanations: [
          'Your working tree is clean.',
          `The remote "${targetRemote}" is available, but upstream tracking has not been set.`,
        ],
        suggestedActionExplanation: `Push to "${targetRemote}" and configure upstream tracking.`,
        suggestedCommands: [`git push -u ${targetRemote} ${data.currentBranch}`],
      };
    }
  }

  // 9. Staged + Unstaged changes (CASE F)
  if (stagedCount > 0 && unstagedCount > 0) {
    const explanations = [
      `${stagedCount} file${stagedCount === 1 ? '' : 's'} ready to commit.`,
      `${unstagedCount} additional change${unstagedCount === 1 ? '' : 's'} are not staged.`,
    ];
    if (untrackedCount > 0) {
      explanations.push(`${untrackedCount} untracked file${untrackedCount === 1 ? '' : 's'} present.`);
    }

    return {
      state: 'modified',
      headline: 'Your changes are split between two states.',
      explanations,
      suggestedActionExplanation: 'Commit your staged changes now, or stage remaining changes first.',
      suggestedCommands: ['git commit', 'git add <files>'],
    };
  }

  // 10. Staged files only
  if (stagedCount > 0 && unstagedCount === 0) {
    const explanations = [
      `${stagedCount} staged file${stagedCount === 1 ? '' : 's'} ready to commit.`,
    ];
    if (untrackedCount > 0) {
      explanations.push(`${untrackedCount} untracked file${untrackedCount === 1 ? '' : 's'} present.`);
    }
    return {
      state: 'modified',
      headline: `${stagedCount} file${stagedCount === 1 ? '' : 's'} staged and ready to commit.`,
      explanations,
      suggestedActionExplanation: 'Record staged changes in a new commit.',
      suggestedCommands: ['git commit'],
    };
  }

  // 11. Modified files only (unstaged)
  if (unstagedCount > 0 && stagedCount === 0) {
    const explanations = [
      `${unstagedCount} modified file${unstagedCount === 1 ? '' : 's'} not staged.`,
    ];
    if (untrackedCount > 0) {
      explanations.push(`${untrackedCount} untracked file${untrackedCount === 1 ? '' : 's'} present.`);
    }
    return {
      state: 'modified',
      headline: `${unstagedCount} file${unstagedCount === 1 ? '' : 's'} modified in working directory.`,
      explanations,
      suggestedActionExplanation: 'Review changes and stage files you wish to commit.',
      suggestedCommands: ['git add <files>'],
    };
  }

  // 12. Untracked files only (CASE G)
  if (untrackedCount > 0 && stagedCount === 0 && unstagedCount === 0) {
    return {
      state: 'untracked_only',
      headline: `You have ${untrackedCount} untracked file${untrackedCount === 1 ? '' : 's'}.`,
      explanations: [
        'These files are not part of Git yet.',
      ],
      suggestedActionExplanation: 'Review untracked files before deciding whether to add them or ignore them in .gitignore.',
      suggestedCommands: ['git status', 'git add <files>'],
    };
  }

  // 13. Clean + Synchronized (CASE A)
  if (data.hasUpstream && data.ahead === 0 && data.behind === 0) {
    return {
      state: 'clean',
      headline: 'Everything looks good.',
      explanations: [
        `Your working tree is clean and your branch is synchronized with ${data.upstreamBranch}.`,
      ],
      suggestedCommands: [],
    };
  }

  // 14. Fallback Clean State
  return {
    state: 'clean',
    headline: 'Everything is clean.',
    explanations: [
      'Your working tree is clean and there are no uncommitted changes.',
    ],
    suggestedCommands: [],
  };
}
