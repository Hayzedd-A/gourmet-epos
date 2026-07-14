/**
 * Word-initial subsequence match: each whitespace-separated query token must
 * prefix-match a word in the target, in order, but not necessarily
 * consecutively (words can be skipped in between). This is what lets
 * "ba in ba co" find "Baileys Infused Banana x Coconut Bread (Extra
 * Large)" — "ba"→Baileys, "in"→Infused, "ba"→Banana, "co"→Coconut, skipping
 * "x" along the way. A query typed as full/normal words works the same way,
 * since a whole word is trivially a prefix of itself — there's no separate
 * "regular search" mode, just this one algorithm.
 */
export function matchesProductSearch(label: string, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const words = label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  let wordIndex = 0;
  for (const token of tokens) {
    let matched = false;
    while (wordIndex < words.length) {
      const word = words[wordIndex];
      wordIndex += 1;
      if (word.startsWith(token)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}
