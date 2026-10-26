import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const root = resolve(__dirname, '..');
const temporaryDirectories: string[] = [];
const hasPowerShell = spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status === 0;

function run(cwd: string, command: string, args: string[]) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_')),
  );
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...environment,
      GIT_AUTHOR_NAME: 'Release test',
      GIT_AUTHOR_EMAIL: 'release-test@example.invalid',
      GIT_COMMITTER_NAME: 'Release test',
      GIT_COMMITTER_EMAIL: 'release-test@example.invalid',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'commit.gpgsign',
      GIT_CONFIG_VALUE_0: 'false',
    },
  });
}

function git(cwd: string, ...args: string[]) {
  const result = run(cwd, 'git', args);
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout.trim();
}

function fixture(testFails = false) {
  const directory = mkdtempSync(join(tmpdir(), 'plugin-release-test-'));
  temporaryDirectories.push(directory);
  const work = join(directory, 'work');
  const remote = join(directory, 'remote.git');
  mkdirSync(work);
  git(directory, 'init', '--bare', remote);
  git(work, 'init', '-b', 'main');
  git(work, 'remote', 'add', 'origin', remote);
  copyFileSync(join(root, 'release.ps1'), join(work, 'release.ps1'));
  copyFileSync(join(root, 'version-bump.mjs'), join(work, 'version-bump.mjs'));
  writeFileSync(join(work, 'package.json'), JSON.stringify({
    name: 'release-test',
    version: '1.0.0',
    scripts: {
      version: 'node version-bump.mjs && git add manifest.json versions.json',
      test: `node -e "process.exit(${testFails ? 1 : 0})"`,
      build: 'node -e "process.exit(0)"',
    },
  }));
  writeFileSync(join(work, 'manifest.json'), JSON.stringify({ version: '1.0.0', minAppVersion: '1.1.0' }));
  writeFileSync(join(work, 'versions.json'), JSON.stringify({ '1.0.0': '1.1.0' }));
  writeFileSync(join(work, 'package-lock.json'), JSON.stringify({
    name: 'release-test', version: '1.0.0', lockfileVersion: 3,
    packages: { '': { name: 'release-test', version: '1.0.0' } },
  }));
  git(work, 'add', '.');
  git(work, 'commit', '-m', 'Initial');
  git(work, 'push', 'origin', 'main');
  return { work, remote };
}

function release(work: string, ...args: string[]) {
  return run(work, 'pwsh', ['-NoProfile', '-NonInteractive', '-File', join(work, 'release.ps1'), ...args]);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!hasPowerShell)('PowerShell release automation', () => {
  it('requires a valid version and nonempty notes without prompting', () => {
    const { work } = fixture();
    for (const args of [[], ['1.0.1'], ['v1.0.1', 'Notes'], ['1.0.1', ' '], ['1.0.0', 'Notes']]) {
      expect(release(work, ...args).status).not.toBe(0);
    }
    expect(git(work, 'status', '--porcelain')).toBe('');
  }, 60000);

  it('publishes synchronized versions and exact multiline notes to a local remote', () => {
    const { work, remote } = fixture();
    const notes = '## Changes\n- Larger titles.\n- 修正副標題；保留 $variables 和 `code`。';
    writeFileSync(join(work, 'untracked.txt'), 'Do not commit');
    const result = release(work, '-Version', '1.0.1', '-Notes', notes);
    expect(result.stderr + result.stdout).not.toContain('failed (exit');
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(git(remote, 'show', 'main:manifest.json')).toContain('"1.0.1"');
    expect(git(remote, 'show', 'main:package-lock.json')).toContain('"1.0.1"');
    expect(git(remote, 'show', 'main:versions.json')).toContain('"1.0.1": "1.1.0"');
    expect(git(remote, 'for-each-ref', '--format=%(contents)', 'refs/tags/1.0.1')).toBe(notes);
    expect(git(remote, 'log', '-1', '--format=%B', 'main')).toBe('Release 1.0.1');
    expect(git(remote, 'rev-parse', 'main')).toBe(git(remote, 'rev-parse', '1.0.1^{}'));
    expect(git(work, 'status', '--porcelain')).toBe('?? untracked.txt');
  }, 60000);

  it('rejects tracked changes without updating versions', () => {
    const { work } = fixture();
    writeFileSync(join(work, 'versions.json'), '{}');
    expect(release(work, '1.0.1', 'Notes').status).not.toBe(0);
    expect(JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')).version).toBe('1.0.0');
  }, 60000);

  it('rejects an existing remote tag before modifying files', () => {
    const { work, remote } = fixture();
    git(work, 'tag', '1.0.1');
    git(work, 'push', 'origin', '1.0.1');
    git(work, 'tag', '-d', '1.0.1');
    const before = git(remote, 'rev-parse', 'main');
    expect(release(work, '1.0.1', 'Notes').status).not.toBe(0);
    expect(git(remote, 'rev-parse', 'main')).toBe(before);
    expect(git(work, 'status', '--porcelain')).toBe('');
  }, 60000);

  it('stops on test failure without committing, tagging, or pushing', () => {
    const { work, remote } = fixture(true);
    const before = git(remote, 'rev-parse', 'main');
    expect(release(work, '1.0.1', 'Notes').status).not.toBe(0);
    expect(git(work, 'rev-parse', 'HEAD')).toBe(before);
    expect(git(work, 'tag', '--list', '1.0.1')).toBe('');
    expect(git(remote, 'rev-parse', 'main')).toBe(before);
    expect(git(remote, 'tag', '--list', '1.0.1')).toBe('');
  }, 60000);
});
