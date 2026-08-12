export interface OrderItem {
  quantity: number;
  unit_price: number;
  products?: {
    name: string;
    cost: number;
  } | null;
}

export interface OrderForMetrics {
  id: string;
  total: number;
  status: string;
  city: string | null;
  created_at: string;
  sku?: string | null;
  order_items?: OrderItem[] | null;
}

export interface FeeConfig {
  deliveryFee: number;
  confirmationFee: number;
  fulfillmentFee: number;
  leadFee?: number;
}

import { normalizeStatus } from '../utils/status';

export const isConfirmedStatus = (status: string): boolean => {
  const norm = normalizeStatus(status);
  // Anything that is OUT_FOR_DELIVERY, DELIVERED, or COMING_BACK must have been confirmed first
  return norm === 'CONFIRMED' || norm === 'OUT_FOR_DELIVERY' || norm === 'DELIVERED' || norm === 'COMING_BACK';
};

export const isDeliveredStatus = (status: string): boolean => {
  return normalizeStatus(status) === 'DELIVERED';
};

export const isPendingStatus = (status: string): boolean => {
  return normalizeStatus(status) === 'NEW';
};

export const isCancelledStatus = (status: string): boolean => {
  return normalizeStatus(status) === 'COMING_BACK';
};

export const isReturnedStatus = (status: string): boolean => {
  // In the new system, both Returns and Cancellations belong to COMING_BACK.
  // We'll keep this for backwards compatibility where needed but map it to COMING_BACK.
  return normalizeStatus(status) === 'COMING_BACK';
};

export const convertAdSpend = (value: number) => Number(value || 0) * 10;

export function calculateDashboardMetrics(
  orders: OrderForMetrics[],
  adSpend: number,
  skuToCostMap: Map<string, number>,
  feeConfig: FeeConfig = { deliveryFee: 35, confirmationFee: 11, fulfillmentFee: 2 },
  startDate?: Date,
  endDate?: Date
) {
  let revenue = 0;
  let totalProductCost = 0;
  let deliveredCount = 0;
  let confirmedCount = 0;
  let pendingCount = 0;
  let cancelledCount = 0;
  let returnedCount = 0;

  // If start/end bounds are provided, filter orders safely using Date parsing (UTC inclusive)
  let ordersToProcess = orders;
  if (startDate && endDate) {
    const startInclusive = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0));
    const endInclusive = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999));
    ordersToProcess = orders.filter((o) => {
      const raw = (o as any).created_at || (o as any).order_date;
      if (!raw) return false;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return false;
      return d >= startInclusive && d <= endInclusive;
    });
  }

  ordersToProcess.forEach((o) => {
    const status = o.status || "";

    // Status counts
    if (isDeliveredStatus(status)) {
      deliveredCount++;
      revenue += Number(o.total || 0);

      // Product cost logic
      let orderProductCost = 0;
      if (o.order_items && o.order_items.length > 0) {
        o.order_items.forEach((item) => {
          const itemCost = item.products?.cost ?? (o.sku ? (skuToCostMap.get(o.sku) ?? 0) : 0);
          orderProductCost += item.quantity * itemCost;
        });
      } else if (o.sku) {
        // Fallback for sheet-synced orders
        orderProductCost = skuToCostMap.get(o.sku) ?? 0;
      }
      totalProductCost += orderProductCost;
    }

    if (isConfirmedStatus(status)) {
      confirmedCount++;
    } else if (isPendingStatus(status)) {
      pendingCount++;
    } else if (isCancelledStatus(status)) {
      cancelledCount++;
    }

    if (isReturnedStatus(status)) {
      returnedCount++;
    }
  });

  // Net Profit formula:
  //                 - (Total_Lead_Count * Lead_Fee)
  const deliveryFeesTotal = deliveredCount * feeConfig.deliveryFee;
  const confirmationFeesTotal = deliveredCount * feeConfig.confirmationFee;
  const fulfillmentFeesTotal = confirmedCount * feeConfig.fulfillmentFee;
  const leadFeesTotal = ordersToProcess.length * (feeConfig.leadFee || 0);

  const calculatedAdSpend = adSpend * 10;

  const netProfit =
    revenue -
    deliveryFeesTotal -
    confirmationFeesTotal -
    fulfillmentFeesTotal -
    leadFeesTotal -
    calculatedAdSpend -
    totalProductCost;

  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const deliveryRate = confirmedCount > 0 ? (deliveredCount / confirmedCount) * 100 : 0;
  const confirmationRate = ordersToProcess.length > 0 ? (confirmedCount / ordersToProcess.length) * 100 : 0;
  const cpa = confirmedCount > 0 ? calculatedAdSpend / confirmedCount : 0;

  return {
    revenue,
    deliveredCount,
    confirmedCount,
    pendingCount,
    cancelledCount,
    returnedCount,
    totalProductCost,
    netProfit,
    profitMargin,
    deliveryRate,
    confirmationRate,
    cpa,
  };
}
