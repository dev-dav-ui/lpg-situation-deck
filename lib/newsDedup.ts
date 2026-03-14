/**
 * Module-level set shared between LiveNewsPanel and GlobalSupplySignals.
 * LiveNewsPanel registers the keys it is showing; GlobalSupplySignals
 * skips any item whose key is already registered.
 *
 * Key = url (preferred) or normalised headline (trim + lowercase).
 */
export const shownNewsKeys = new Set<string>();

export function newsKey(url: string | undefined, headline: string): string {
  return url?.trim() || headline.toLowerCase().trim();
}
