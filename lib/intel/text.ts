/** Shared text normalisation for queries and product names (English + common Hinglish). */

export const STOPWORDS = new Set(
  (
    "a an and are as at be best buy by can cheap cost do does for from get good how i in india indian is it ki ka ke kya kaise me " +
    "my near of on online or order price prices rate rs shop the to top use uses vs what where which who why with without " +
    "kg g gm gram grams ml litre liter ltr pack packs combo box default title variety varienty pcs piece pieces"
  ).split(" "),
);

const SYNONYMS: Record<string, string> = {
  diabetes: "diabetic",
  diabetics: "diabetic",
  sugar: "diabetic",
  rotis: "roti",
  chapati: "roti",
  chapatis: "roti",
  chapathi: "roti",
  flours: "flour",
  aata: "atta",
  ata: "atta",
  recipes: "recipe",
  foods: "food",
  breakfasts: "breakfast",
  glycemic: "gi",
  glycaemic: "gi",
};

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? t);
}

export function contentTokens(text: string): string[] {
  return tokens(text).filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t) && t.length > 1);
}

/** Unigrams, bigrams and trigrams (adjacent content tokens) used as topic candidates. */
export function candidateTerms(text: string): string[] {
  const t = contentTokens(text);
  const out = new Set<string>(t);
  for (let i = 0; i < t.length - 1; i++) out.add(`${t[i]} ${t[i + 1]}`);
  for (let i = 0; i < t.length - 2; i++) out.add(`${t[i]} ${t[i + 1]} ${t[i + 2]}`);
  return [...out];
}

/** "Varienty Box Ruby Roti mix Atta Pack - Default Title" → "Ruby Roti Mix Atta" style display name. */
export function cleanProductName(name: string): string {
  return name
    .replace(/\s*-\s*Default Title\s*$/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b\d+(\.\d+)?\s?(kg|g|gm|grams?|ml|l|ltr|pcs|pieces?|x)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
