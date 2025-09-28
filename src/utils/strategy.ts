import type { AsterAccountSnapshot, AsterKline } from "../exchanges/types";

export interface PositionSnapshot {
  positionAmt: number;
  entryPrice: number;
  unrealizedProfit: number;
  markPrice: number | null;
}

export function getPosition(snapshot: AsterAccountSnapshot | null, symbol: string): PositionSnapshot {
  if (!snapshot) {
    return { positionAmt: 0, entryPrice: 0, unrealizedProfit: 0, markPrice: null };
  }
  const positions = snapshot.positions?.filter((p) => p.symbol === symbol) ?? [];
  if (positions.length === 0) {
    return { positionAmt: 0, entryPrice: 0, unrealizedProfit: 0, markPrice: null };
  }
  const NON_ZERO_EPS = 1e-8;
  const withExposure = positions.filter((p) => Math.abs(Number(p.positionAmt)) > NON_ZERO_EPS);
  const selected =
    withExposure.find((p) => p.positionSide === "BOTH") ??
    withExposure.sort((a, b) => Math.abs(Number(b.positionAmt)) - Math.abs(Number(a.positionAmt)))[0] ??
    positions[0];
  const rawMark = Number(selected?.markPrice);
  const markPrice = Number.isFinite(rawMark) && rawMark > 0 ? rawMark : null;
  return {
    positionAmt: Number(selected?.positionAmt) || 0,
    entryPrice: Number(selected?.entryPrice) || 0,
    unrealizedProfit: Number(selected?.unrealizedProfit) || 0,
    markPrice,
  };
}

export function getSMA(values: AsterKline[], length: number): number | null {
  if (!values || values.length < length) return null;
  const closes = values.slice(-length).map((k) => Number(k.close));
  const sum = closes.reduce((acc, current) => acc + current, 0);
  return sum / closes.length;
}

export function calcStopLossPrice(entryPrice: number, qty: number, side: "long" | "short", loss: number): number {
  if (side === "long") {
    return entryPrice - loss / qty;
  }
  return entryPrice + loss / Math.abs(qty);
}

export function calcTrailingActivationPrice(entryPrice: number, qty: number, side: "long" | "short", profit: number): number {
  if (side === "long") {
    return entryPrice + profit / qty;
  }
  return entryPrice - profit / Math.abs(qty);
}

/**
 * Return true if the intended order price is within the allowed deviation from mark price.
 * - For BUY: orderPrice must be <= markPrice * (1 + maxPct)
 * - For SELL: orderPrice must be >= markPrice * (1 - maxPct)
 * If markPrice is null/invalid, the check passes (no protection possible).
 */
export function isOrderPriceAllowedByMark(params: {
  side: "BUY" | "SELL";
  orderPrice: number | null | undefined;
  markPrice: number | null | undefined;
  maxPct: number;
}): boolean {
  const { side, orderPrice, markPrice, maxPct } = params;
  const price = Number(orderPrice);
  const mark = Number(markPrice);
  if (!Number.isFinite(price) || !Number.isFinite(mark) || mark <= 0) return true;
  if (side === "BUY") {
    return price <= mark * (1 + Math.max(0, maxPct));
  }
  return price >= mark * (1 - Math.max(0, maxPct));
}

/**
 * 检查是否应该按百分比止损
 * @param position 当前持仓信息
 * @param currentPrice 当前价格（用于计算实时PnL）
 * @param stopLossPercentage 止损百分比（如0.0075表示0.75%）
 * @returns 是否应该止损
 */
export function shouldStopLossByPercentage(
  position: PositionSnapshot,
  currentPrice: number,
  stopLossPercentage: number
): boolean {
  const absPosition = Math.abs(position.positionAmt);
  if (absPosition < 1e-8) return false; // 无持仓
  
  const hasEntryPrice = Number.isFinite(position.entryPrice) && Math.abs(position.entryPrice) > 1e-8;
  if (!hasEntryPrice) return false; // 无有效入场价
  
  // 计算实时PnL百分比
  const isLong = position.positionAmt > 0;
  const pnlPercentage = isLong 
    ? (currentPrice - position.entryPrice) / position.entryPrice
    : (position.entryPrice - currentPrice) / position.entryPrice;
  
  // 当亏损百分比超过止损线时触发（使用容差处理浮点数精度）
  const tolerance = 1e-10;
  return pnlPercentage < (-stopLossPercentage + tolerance);
}

/**
 * 检查是否应该按百分比止盈
 * @param position 当前持仓信息  
 * @param currentPrice 当前价格（用于计算实时PnL）
 * @param takeProfitPercentage 止盈百分比（如0.015表示1.5%）
 * @returns 是否应该止盈
 */
export function shouldTakeProfitByPercentage(
  position: PositionSnapshot,
  currentPrice: number,
  takeProfitPercentage: number
): boolean {
  const absPosition = Math.abs(position.positionAmt);
  if (absPosition < 1e-8) return false; // 无持仓
  
  const hasEntryPrice = Number.isFinite(position.entryPrice) && Math.abs(position.entryPrice) > 1e-8;
  if (!hasEntryPrice) return false; // 无有效入场价
  
  // 计算实时PnL百分比
  const isLong = position.positionAmt > 0;
  const pnlPercentage = isLong 
    ? (currentPrice - position.entryPrice) / position.entryPrice
    : (position.entryPrice - currentPrice) / position.entryPrice;
  
  // 当盈利百分比超过止盈线时触发（使用容差处理浮点数精度）
  const tolerance = 1e-10;
  return pnlPercentage > (takeProfitPercentage - tolerance);
}
