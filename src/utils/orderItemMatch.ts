/**
 * Matches order items against shipped/received line items safely.
 * Prioritizes `productId` / `product_id` when both records have it,
 * and falls back to `name + type + size` for historical records.
 */

export interface MatchableOrderLine {
  productId?: string;
  product_id?: string;
  name?: string;
  type?: string;
  size?: string;
}

const getProductId = (item?: MatchableOrderLine): string =>
  (item?.productId || item?.product_id || '').trim();

const normalizeText = (value?: string): string => (value || '').trim().toLowerCase();

export function isSameOrderLine(a?: MatchableOrderLine, b?: MatchableOrderLine): boolean {
  if (!a || !b) return false;

  const aProdId = getProductId(a);
  const bProdId = getProductId(b);
  if (aProdId && bProdId) {
    return aProdId === bProdId;
  }

  return (
    normalizeText(a.name) === normalizeText(b.name) &&
    normalizeText(a.type) === normalizeText(b.type) &&
    normalizeText(a.size) === normalizeText(b.size)
  );
}

export function findMatchingOrderLine<T extends MatchableOrderLine>(
  list: T[] | undefined | null,
  target: MatchableOrderLine
): T | undefined {
  if (!list || list.length === 0) return undefined;
  return list.find((item) => isSameOrderLine(item, target));
}

export function getOrderLineKey(item: MatchableOrderLine): string {
  const pid = getProductId(item);
  if (pid) return pid;
  return `${(item.name || '').trim()}-${(item.type || '').trim()}-${(item.size || '').trim()}`;
}

