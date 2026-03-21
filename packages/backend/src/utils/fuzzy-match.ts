export interface PicklistOption {
  value: string;
  aliases?: string[];
  slug?: string;
}

/**
 * Simple similarity score between two strings (0-1).
 * Uses longest common subsequence ratio.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length < b.length ? a : b;
  if (longer.length === 0) return 1;

  // LCS-based similarity
  const lcs = lcsLength(shorter, longer);
  return (2 * lcs) / (shorter.length + longer.length);
}

function lcsLength(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Get all searchable strings for an option (value + slug + aliases), all lowercased.
 */
function optionCandidates(opt: PicklistOption): string[] {
  const candidates = [opt.value.toLowerCase()];
  if (opt.slug) candidates.push(opt.slug.toLowerCase());
  if (opt.aliases) {
    for (const a of opt.aliases) candidates.push(a.toLowerCase());
  }
  return candidates;
}

/**
 * Match a raw string to the best picklist option using:
 * 1. Exact match (value, slug, aliases)
 * 2. Substring containment (raw contains option or option contains raw)
 * 3. Best similarity score (threshold > 0.4)
 *
 * Returns the resolved value (or slug if useSlug=true), or null if no reasonable match.
 */
export function fuzzyMatchPicklist(
  raw: string,
  options: PicklistOption[],
  useSlug: boolean = false,
): string | null {
  if (!raw || options.length === 0) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;

  const resolve = (opt: PicklistOption) => useSlug && opt.slug ? opt.slug : opt.value;

  // Pass 1: exact match
  for (const opt of options) {
    for (const candidate of optionCandidates(opt)) {
      if (candidate === key) return resolve(opt);
    }
  }

  // Pass 2: substring containment
  for (const opt of options) {
    for (const candidate of optionCandidates(opt)) {
      if (key.includes(candidate) || candidate.includes(key)) {
        return resolve(opt);
      }
    }
  }

  // Pass 3: best similarity score
  let bestScore = 0;
  let bestOpt: PicklistOption | null = null;
  for (const opt of options) {
    for (const candidate of optionCandidates(opt)) {
      const score = similarity(key, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestOpt = opt;
      }
    }
  }

  // Only accept if similarity is reasonable (> 0.4)
  if (bestOpt && bestScore > 0.4) {
    return resolve(bestOpt);
  }

  return null;
}
