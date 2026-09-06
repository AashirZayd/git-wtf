export type FileStatusKind = 'staged' | 'modified' | 'deleted' | 'untracked' | 'renamed' | 'conflict';

export interface ChangedFile {
  path: string;
  origPath?: string;
  kind: FileStatusKind;
  stagedKind?: 'added' | 'modified' | 'deleted' | 'renamed';
  unstagedKind?: 'modified' | 'deleted' | 'untracked' | 'conflict';
}

export interface CommitInfo {
  hash: string;
  relativeTime: string;
  subject: string;
  author?: string;
}

export interface StashInfo {
  count: number;
  latest?: string;
}

export interface SpecialOperationState {
  merge: boolean;
  rebase: boolean;
  cherryPick: boolean;
  revert: boolean;
  bisect: boolean;
}

export type RepoLifecycleState =
  | 'clean'
  | 'modified'
  | 'conflicted'
  | 'diverged'
  | 'ahead'
  | 'behind'
  | 'special_op'
  | 'empty'
  | 'untracked_only';

export interface RawGitData {
  isGitRepo: boolean;
  gitDir?: string;
  commonDir?: string;
  currentBranch: string | null;
  detachedHead: boolean;
  detachedCommit?: string;
  upstreamBranch: string | null;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  remotes: string[];
  hasOrigin: boolean;
  hasCommits: boolean;
  files: {
    staged: ChangedFile[];
    modified: ChangedFile[];
    deleted: ChangedFile[];
    untracked: ChangedFile[];
    renamed: ChangedFile[];
    conflicts: ChangedFile[];
  };
  stashes: StashInfo;
  recentCommits: CommitInfo[];
  operations: SpecialOperationState;
}

export interface GitWtfAnalysis {
  state: RepoLifecycleState;
  headline: string;
  explanations: string[];
  suggestedActionExplanation?: string;
  suggestedCommands: string[];
}

export interface GitWtfReport {
  data: RawGitData;
  analysis: GitWtfAnalysis;
}
