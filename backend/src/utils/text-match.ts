const STOP = new Set([
  "with", "from", "that", "this", "were", "have", "been", "into", "over", "under", "about", "their", "they",
  "documented", "evidence", "photos", "photo", "image", "images", "media", "project", "show", "find",
]);

/**
 * Words of four letters or more, cut to a short stem, so that "sapling
 * planting" meets "tree planting" and "planting" meets "plantation". Simple
 * and explainable: a judge can see exactly why something matched.
 */
export function stems(terms: string[]) {
  return [...new Set(terms.flatMap((term) => term.toLowerCase().split(/[^a-z0-9]+/))
    .filter((word) => word.length >= 4 && !STOP.has(word))
    .map((word) => (word.length > 6 ? word.slice(0, 5) : word)))];
}

/** True when the phrase appears as-is, or any of its word stems does. */
export function mentions(haystack: string, phrase: string) {
  const text = phrase.toLowerCase().trim();
  if (!text) return true;
  if (haystack.includes(text)) return true;
  return stems([text]).some((stem) => haystack.includes(stem));
}
