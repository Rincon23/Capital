/**
 * Text helpers for reading what the user said. Whisper writes "Débito", "débito" or "debito"
 * depending on the recording, so every comparison happens on folded text: lower case, no
 * accents. Folding keeps the length, so a position found in the folded text is the same
 * position in the original (NFC) text.
 */
export function foldText(text: string): string {
  let folded = '';
  for (const char of text) {
    const plain = char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    folded += plain.length === char.length ? plain : ' '.repeat(char.length);
  }
  return folded;
}

/**
 * The text as the rules read it: NFC, one line, single spaces. whisper.cpp breaks the text
 * between segments, sometimes in the middle of a word ("conhec\nimentos").
 */
export function cleanTranscript(text: string): string {
  return text.normalize('NFC').replace(/\r?\n/g, '').replace(/\s+/g, ' ').trim();
}

/** "conta de luz" → "Conta de luz". */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The singular and plural spellings of one (folded) Portuguese word, enough for category
 * names: "custos" ↔ "custo", "conhecimento" ↔ "conhecimentos", "anual" ↔ "anuais".
 */
export function wordVariants(word: string): string[] {
  if (word.length <= 2) return [word];
  const variants = new Set([word]);
  const swap = (from: string, to: string) => {
    if (word.endsWith(from)) variants.add(word.slice(0, -from.length) + to);
  };
  swap('oes', 'ao');
  swap('aes', 'ao');
  swap('ao', 'oes');
  swap('ais', 'al');
  swap('al', 'ais');
  swap('eis', 'el');
  swap('el', 'eis');
  swap('ns', 'm');
  swap('m', 'ns');
  if (/[rz]es$/.test(word)) variants.add(word.slice(0, -2));
  if (/[rz]$/.test(word)) variants.add(`${word}es`);
  if (word.endsWith('s')) variants.add(word.slice(0, -1));
  else if (/[aeiou]$/.test(word)) variants.add(`${word}s`);
  return [...variants];
}

/** A regex source matching `phrase` (folded) with any singular/plural spelling of each word. */
export function phrasePattern(phrase: string): string {
  const words = foldText(phrase)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const parts = words.map((word) => {
    const variants = wordVariants(word).map(escapeRegExp);
    return variants.length === 1 ? variants[0] : `(?:${variants.join('|')})`;
  });
  return `\\b${parts.join('[\\s-]+')}\\b`;
}
