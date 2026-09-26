export const ORDER_STATUS = {
  DIPESAN: "DIPESAN",
  DIBATALKAN: "DIBATALKAN",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
