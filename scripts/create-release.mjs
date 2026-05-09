import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const details = stderr || stdout || `git ${args.join(' ')}`;
    throw new Error(details);
  }

  return result.stdout.trim();
}

function githubHttpsRemote(remoteUrl) {
  const trimmed = remoteUrl.trim();

  const httpsMatch = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(trimmed);
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}.git`;
  }

  const sshMatch = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(trimmed);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}.git`;
  }

  const sshUrlMatch = /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(trimmed);
  if (sshUrlMatch) {
    return `https://github.com/${sshUrlMatch[1]}.git`;
  }

  return null;
}

function parseVersion(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) {
    throw new Error(`Ugyldig semver-tag: ${tag}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatVersion(version) {
  return `v${version.major}.${version.minor}.${version.patch}`;
}

function bumpVersion(version, bumpType) {
  if (bumpType === 'major') {
    return {
      major: version.major + 1,
      minor: 0,
      patch: 0,
    };
  }

  if (bumpType === 'minor') {
    return {
      major: version.major,
      minor: version.minor + 1,
      patch: 0,
    };
  }

  return {
    major: version.major,
    minor: version.minor,
    patch: version.patch + 1,
  };
}

function latestTag() {
  const output = runGit(['tag', '--list', 'v*', '--sort=-v:refname']);
  const tags = output
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags[0] ?? 'v0.0.0';
}

function refExists(ref) {
  try {
    runGit(['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function resolveBaseRef() {
  if (refExists('origin/main')) {
    return 'origin/main';
  }

  if (refExists('main')) {
    return 'main';
  }

  return 'HEAD';
}

function fetchRemoteRefs() {
  const attempts = [];
  const remoteUrl = runGit(['config', '--get', 'remote.origin.url']);

  attempts.push(['origin']);

  const httpsRemote = githubHttpsRemote(remoteUrl);
  if (httpsRemote && httpsRemote !== remoteUrl) {
    attempts.push([httpsRemote]);
  }

  for (const [remote] of attempts) {
    try {
      runGit(['fetch', '--tags', '--prune', remote, 'main']);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Kunne ikke hente refs via ${remote}: ${message}`);
    }
  }

  console.warn('Fortsetter med lokale refs og tags.');
  return false;
}

function ensureCleanWorkingTree() {
  const status = runGit(['status', '--porcelain']);
  if (status) {
    throw new Error('Arbeidstreet er ikke rent. Commit eller stash endringene før du kjører release-scriptet.');
  }
}

function normalizeBumpType(input) {
  const value = input.trim().toLowerCase();
  if (value === 'm' || value === 'major') return 'major';
  if (value === 'n' || value === 'minor' || value === 'mi') return 'minor';
  if (value === 'p' || value === 'patch' || value === '') return 'patch';
  return null;
}

function yesAnswer(input, fallback = true) {
  const value = input.trim().toLowerCase();
  if (value === '') {
    return fallback;
  }

  return ['y', 'yes', 'ja', 'j'].includes(value);
}

async function main() {
  try {
    runGit(['rev-parse', '--is-inside-work-tree']);
    ensureCleanWorkingTree();

    fetchRemoteRefs();

    const currentTag = latestTag();
    const currentVersion = parseVersion(currentTag);

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(`Gjeldende tag: ${currentTag}`);

    let bumpType = null;
    while (!bumpType) {
      const answer = await rl.question('Bump type [major/minor/patch] (default patch): ');
      bumpType = normalizeBumpType(answer);
      if (!bumpType) {
        console.log('Velg major, minor eller patch.');
      }
    }

    const nextVersion = bumpVersion(currentVersion, bumpType);
    const nextTag = formatVersion(nextVersion);
    const defaultBranch = `release/${nextTag}`;
    const branchNameInput = await rl.question(`Release branch [${defaultBranch}]: `);
    const branchName = branchNameInput.trim() || defaultBranch;

    const pushAnswer = await rl.question('Push branch and tag to origin now? [Y/n]: ');
    const shouldPush = yesAnswer(pushAnswer, true);

    rl.close();

    runGit(['switch', '--create', branchName, resolveBaseRef()]);
    runGit(['commit', '--allow-empty', '-m', `chore(release): ${nextTag}`]);
    runGit(['tag', '-a', nextTag, '-m', `Release ${nextTag}`]);

    console.log(`Opprettet branch ${branchName} og tag ${nextTag}.`);

    if (shouldPush) {
      runGit(['push', '-u', 'origin', branchName]);
      runGit(['push', 'origin', nextTag]);
      console.log('Branch og tag er pushet til origin.');
      console.log('CasaOS kan nå oppdateres ved å hente nyeste image-tag.');
    } else {
      console.log('Branch og tag er kun opprettet lokalt.');
      console.log(`Push senere med: git push -u origin ${branchName} && git push origin ${nextTag}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
