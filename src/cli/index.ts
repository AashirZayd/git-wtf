import pc from 'picocolors';
import { collectGitData } from '../git/collector.js';
import { analyzeGitState } from '../analysis/interpreter.js';
import { renderTerminal, renderJson } from '../output/renderer.js';

interface CliOptions {
  json: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
  unknownArgs: string[];
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    verbose: false,
    help: false,
    version: false,
    unknownArgs: [],
  };

  for (const arg of args) {
    if (arg === '--json' || arg === '-j') {
      options.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-V') {
      options.version = true;
    } else {
      options.unknownArgs.push(arg);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
${pc.bold(pc.cyan('git-wtf'))} - The human-friendly Git status interpreter.

${pc.bold('USAGE:')}
  git wtf [options]
  git-wtf [options]

${pc.bold('OPTIONS:')}
  -j, --json       Output raw structured state in JSON format
  -v, --verbose    Show individual changed files in addition to summary
  -h, --help       Display this help message
  -V, --version    Show version number

${pc.bold('EXAMPLES:')}
  git wtf          Inspect current repository state and get a human explanation
  git wtf --json   Get machine-readable JSON status for scripts or editor integrations
  git wtf -v       Detailed view with modified/staged file names
`);
}

export function runCli(argv: string[] = process.argv.slice(2)): void {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log('git-wtf version 0.1.0');
    process.exit(0);
  }

  if (options.unknownArgs.length > 0) {
    const unknown = options.unknownArgs.join(', ');
    if (options.json) {
      console.error(JSON.stringify({ error: `Unknown argument(s): ${unknown}` }));
    } else {
      console.error(`${pc.red('Error:')} Unknown argument(s): ${unknown}\nRun 'git wtf --help' to view available options.`);
    }
    process.exit(1);
  }

  try {
    const rawData = collectGitData();

    if (!rawData.isGitRepo) {
      if (options.json) {
        console.log(
          renderJson({
            data: rawData,
            analysis: analyzeGitState(rawData),
          })
        );
      } else {
        console.error(`${pc.red('Error:')} Not inside a Git repository.`);
        console.error(`git-wtf must be run inside a Git repository.`);
        console.error(`\nRun ${pc.bold('git init')} to create a new Git repository.`);
      }
      process.exit(1);
    }

    const analysis = analyzeGitState(rawData);
    const report = { data: rawData, analysis };

    if (options.json) {
      // JSON mode: clean JSON stdout without ANSI or decorations
      console.log(renderJson(report));
    } else {
      console.log(renderTerminal(report, { verbose: options.verbose }));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.json) {
      console.error(JSON.stringify({ error: msg }));
    } else {
      console.error(`${pc.red('Error:')} ${msg}`);
    }
    process.exit(1);
  }
}
