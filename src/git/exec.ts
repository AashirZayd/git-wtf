import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export function execGit(args: string[], cwd: string = process.cwd()): CommandResult {
  try {
    const res = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        // Ensure consistent output language and behavior
        LANG: 'C',
        LC_ALL: 'C',
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    if (res.error) {
      // Check if git is missing
      const err = res.error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error('Git was not found on your PATH. Please make sure Git is installed and available in your environment.');
      }
      return {
        stdout: '',
        stderr: res.error.message,
        exitCode: 1,
        success: false,
      };
    }

    return {
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      exitCode: res.status ?? 0,
      success: res.status === 0,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(String(err));
  }
}
