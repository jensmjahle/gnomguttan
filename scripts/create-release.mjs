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

function pushRemoteRefs(branchName, tagName) {
  const remoteUrl = runGit(['config', '--get', 'remote.origin.url']);
  const httpsRemote = githubHttpsRemote(remoteUrl);
  const attempts = httpsRemote && httpsRemote !== remoteUrl ? [httpsRemote, 'origin'] : ['origin'];
  const errors = [];

  for (const remote of attempts) {
    try {
      runGit(['push', '-u', remote, branchName]);
      runGit(['push', remote, tagName]);
      console.log(`Branch og tag er pushet via ${remote}.`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`via ${remote}: ${message}`);
    }
  }

  console.warn(`Kunne ikke pushe branch og tag (${errors.join(' | ')}).`);
  console.warn('Branch og tag ble beholdt lokalt.');
  return false;
}

function ensureCleanWorkingTree() {
  const status = runGit(['status', '--porcelain']);
  if (status) {
    throw new Error('Arbeidstreet er ikke rent. Commit eller stash endringene før du kjører release-scriptet.');
  }
}

function yesAnswer(input, fallback = true) {
  const value = input.trim().toLowerCase();
  if (value === '') {
    return fallback;
  }

  return ['y', 'yes', 'ja', 'j'].includes(value);
}

function formatVersionSummary(currentTag, nextVersion, bumpType) {
  const nextTag = formatVersion(nextVersion);

  if (bumpType === 'major') {
    return `${currentTag} -> ${nextTag}  (ny hovedversjon, kan inneholde breaking changes)`;
  }

  if (bumpType === 'minor') {
    return `${currentTag} -> ${nextTag}  (ny funksjonalitet, skal være bakoverkompatibel)`;
  }

  return `${currentTag} -> ${nextTag}  (feilretting og små endringer)`;
}

function printReleaseHelp(currentTag, currentVersion) {
  console.log('');
  console.log('Velg release-type:');
  console.log(`  1) major  - bryter ofte kompatibilitet`);
  console.log(`  2) minor  - ny funksjonalitet uten breaking changes`);
  console.log(`  3) patch  - feilrettinger og små justeringer`);
  console.log('  4) avbryt - avslutt uten å lage tag');
  console.log('');
  console.log(`Eksempel ut fra ${currentTag}:`);
  console.log(`  1) major -> v${currentVersion.major + 1}.0.0`);
  console.log(`  2) minor -> v${currentVersion.major}.${currentVersion.minor + 1}.0`);
  console.log(`  3) patch -> v${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch + 1}`);
  console.log('');
}

function parseMenuChoice(input) {
  const value = input.trim();
  if (value === '1') return 'major';
  if (value === '2') return 'minor';
  if (value === '3') return 'patch';
  if (value === '4') return 'cancel';
  return null;
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
    printReleaseHelp(currentTag, currentVersion);

    let bumpType = null;
    while (!bumpType) {
      const answer = await rl.question('Velg release-type [1-4]: ');
      const choice = parseMenuChoice(answer);

      if (choice === 'cancel') {
        console.log('Avbrutt. Ingen branch eller tag ble opprettet.');
        rl.close();
        return;
      }

      bumpType = choice;
      if (!bumpType) {
        console.log('Skriv 1, 2, 3 eller 4.');
      }
    }

    const nextVersion = bumpVersion(currentVersion, bumpType);
    const nextTag = formatVersion(nextVersion);
    console.log(formatVersionSummary(currentTag, nextVersion, bumpType));
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
      const pushed = pushRemoteRefs(branchName, nextTag);
      if (pushed) {
        console.log('CasaOS kan nå oppdateres ved å hente nyeste image-tag.');
      } else {
        console.log(`Push manuelt senere med: git push -u origin ${branchName} && git push origin ${nextTag}`);
        console.log('Hvis SSH ikke er satt opp, bytt origin til HTTPS eller bruk GitHub credential manager.');
      }
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
