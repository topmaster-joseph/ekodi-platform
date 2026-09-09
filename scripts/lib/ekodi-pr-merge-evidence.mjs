const text = value => String(value ?? '').trim();

export function isPrMergeMessage(message) {
  const value = text(message);
  if (!value) return false;
  return /^Merge (?:pull request|PR) #\d+\b/m.test(value)
    || /\(#\d+\)\s*(?:\n|$)/m.test(value);
}

export function inspectRawCommit(rawCommit) {
  const raw = String(rawCommit ?? '');
  const parentCount = (raw.match(/^parent [0-9a-f]{40}$/gm) || []).length;
  const committer = raw.match(/^committer\s+(.+?)\s+<([^>]+)>\s+\d+\s+[+-]\d{4}$/m);
  return {
    parentCount,
    committerName: text(committer?.[1]),
    committerEmail: text(committer?.[2]).toLowerCase(),
  };
}

export function isGithubPrMergeCommit({ message, eventMessage, rawCommit }) {
  const evidence = inspectRawCommit(rawCommit);
  const hasPrMarker = isPrMergeMessage(eventMessage) || isPrMergeMessage(message);
  const githubCommitter = evidence.committerName === 'GitHub'
    && evidence.committerEmail === 'noreply@github.com';
  return evidence.parentCount >= 2 && hasPrMarker && githubCommitter;
}
