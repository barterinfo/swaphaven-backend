import {
  DataSet,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

// Innocent words that contain a blacklisted substring (the "Scunthorpe problem").
// A whitelisted term suppresses any profanity match that falls within it, so a
// listing for a "bass guitar" or shipping to "Essex" is no longer rejected.
// Roots are enough: whitelisting "glass" also covers "glasses"/"glassware".
const WHITELIST = [
  // ...ass
  "class", "glass", "grass", "pass", "bass", "brass", "mass", "lass",
  "assist", "assess", "assign", "asset", "assert", "assemble", "associate",
  "assume", "assure", "embassy", "ambassador", "harass", "compass",
  "potassium", "cassette", "carcass", "molasses",
  // ...sex
  "essex", "sussex", "middlesex", "unisex", "sextant", "sextet",
  // ...tit
  "title", "titan", "tithe", "competit", "petition", "repetition",
  "constitut", "substitut", "institut", "attitude", "altitude", "latitude",
  "gratitude", "quantit", "identit", "entity", "partition", "restitution",
  // ...cock
  "cocktail", "peacock", "hitchcock", "shuttlecock", "cockpit", "cockroach",
  "cockney", "woodcock", "stopcock", "gamecock", "hancock", "babcock",
  // ...anal
  "analog", "analy", "canal", "banal",
  // ...cum
  "cucumber", "document", "accumulate", "circumstance", "cumulative",
  "vacuum", "incumbent", "succumb", "circumference", "encumber",
  // ...rape
  "grape", "drape", "scrape", "trapeze",
  // ...anus
  "uranus", "manuscript",
  // ...dick
  "dickens", "dickinson", "dickson",
];

// Single shared matcher. The recommended transformers cover common obfuscation
// (leetspeak, spacing, repeated characters) so "s.e.x" / "pr0n" are still caught.
const dataset = new DataSet<{ originalWord: string }>()
  .addAll(englishDataset)
  .addPhrase((phrase) => {
    for (const term of WHITELIST) phrase.addWhitelistedTerm(term);
    return phrase;
  });

const matcher = new RegExpMatcher({
  ...dataset.build(),
  ...englishRecommendedTransformers,
});

export function containsProfanity(text: string | null | undefined): boolean {
  if (!text) return false;
  return matcher.hasMatch(text);
}

export type ModerationField = { field: string; value: string | null | undefined };

/**
 * Returns the name of the first field whose value contains profanity, or null
 * when every field is clean. Callers reject the request with a 400 when a field
 * is returned. Keeps route handlers thin and the policy in one place.
 */
export function findProfaneField(fields: ModerationField[]): string | null {
  for (const { field, value } of fields) {
    if (containsProfanity(value)) return field;
  }
  return null;
}
