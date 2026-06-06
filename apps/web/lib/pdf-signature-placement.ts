/** Clamp overlay page numbers so fields/signatures render on an existing PDF page. */
export function clampPlacementToPageCount<T extends { pageNumber: number }>(
  items: T[],
  pageCount: number | null | undefined,
): T[] {
  if (!pageCount || pageCount < 1) return items;
  return items.map((item) =>
    item.pageNumber > pageCount ? { ...item, pageNumber: pageCount } : item,
  );
}
