/** Exclude recognisably non-chat entries when older catalogues omit modality metadata. */
export function isChatModelId(id: string): boolean {
  return !/(?:embed|rerank|(?:^|[\/_-])bge(?:[\/_-]|$)|(?:^|[\/_-])uae(?:[\/_-]|$))/i.test(id);
}
