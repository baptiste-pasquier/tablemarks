/**
 * The comparison form of a name: no Latin accents, underscores as spaces, single spaces, trimmed,
 * lowercase. A mark is stripped only from a Latin letter: in other scripts it changes the word
 * (パン is bread, ハン is not; й is not и), so those are recomposed intact.
 */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[\s_]+/g, ' ')
    .trim()
    .toLowerCase()
}
