export function buildProductInventoryUpdateData(nextInventory: number, quantitySold: number, soldOutAt = new Date()) {
  return {
    inventory: nextInventory,
    soldQty: { increment: quantitySold },
    ...(nextInventory <= 0
      ? {
          status: 'SOLD' as const,
          delistedAt: soldOutAt,
        }
      : {}),
  };
}
