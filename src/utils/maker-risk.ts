import type { PositionSnapshot } from "./strategy";

/**
 * 判断是否应该止损
 */
export function shouldMakerStopLoss(
  position: PositionSnapshot,
  bidPrice: number,
  askPrice: number,
  lossLimit: number
): boolean {
  const absPosition = Math.abs(position.positionAmt);
  if (absPosition < 1e-5) return false;

  const hasEntryPrice = Number.isFinite(position.entryPrice) && Math.abs(position.entryPrice) > 1e-8;
  if (!hasEntryPrice) return false;

  // 计算当前PnL
  const isLong = position.positionAmt > 0;
  const currentPrice = isLong ? bidPrice : askPrice; // 平仓价格
  const pnl = (currentPrice - position.entryPrice) * position.positionAmt;

  // 当前亏损超过限制时触发止损
  return pnl < -lossLimit;
}

/**
 * 判断是否应该止盈
 */
export function shouldMakerTakeProfit(
  position: PositionSnapshot,
  bidPrice: number,
  askPrice: number,
  profitTarget: number
): boolean {
  const absPosition = Math.abs(position.positionAmt);
  if (absPosition < 1e-5) return false;

  const hasEntryPrice = Number.isFinite(position.entryPrice) && Math.abs(position.entryPrice) > 1e-8;
  if (!hasEntryPrice) return false;

  // 计算当前PnL
  const isLong = position.positionAmt > 0;
  const currentPrice = isLong ? bidPrice : askPrice; // 平仓价格
  const pnl = (currentPrice - position.entryPrice) * position.positionAmt;

  // 当前盈利达到目标时触发止盈
  return pnl >= profitTarget;
}

/**
 * 计算做市商持仓盈亏
 */
export function computeMakerPnl(
  position: PositionSnapshot,
  bidPrice: number,
  askPrice: number
): number {
  const absPosition = Math.abs(position.positionAmt);
  if (absPosition < 1e-5) return 0;

  const hasEntryPrice = Number.isFinite(position.entryPrice) && Math.abs(position.entryPrice) > 1e-8;
  if (!hasEntryPrice) return 0;

  const isLong = position.positionAmt > 0;
  const currentPrice = isLong ? bidPrice : askPrice;
  return (currentPrice - position.entryPrice) * position.positionAmt;
}
