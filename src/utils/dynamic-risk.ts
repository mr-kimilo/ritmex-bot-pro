/**
 * 动态风险管理工具
 * 根据当前价格动态调整风险管理参数
 */

export interface DynamicRiskConfig {
  symbol: string;
  baseAmount: number;        // 基础交易数量
  riskPercentage: number;    // 风险百分比 (如 1% = 0.01)
  profitTarget: number;      // 目标收益百分比 (如 2% = 0.02)
  trailingCallback: number;  // 追踪回调百分比 (如 0.8% = 0.008)
  profitLockRatio: number;   // 利润保护比例 (如 75% = 0.75)
  protectionOffset: number;  // 保护偏移百分比 (如 0.5% = 0.005)
  // 高频交易参数
  minHoldTimeMs: number;     // 最小持仓时间 (毫秒)
  maxPositionMultiplier: number; // 最大仓位倍数
  recalcThreshold: number;   // 重新计算价格阈值
}

export interface DynamicRiskParams {
  lossLimit: number;           // 止损金额 (USD)
  trailingProfit: number;      // 追踪止盈激活金额 (USD)
  trailingCallbackRate: number; // 追踪回调百分比
  profitLockTrigger: number;   // 利润保护触发金额 (USD)
  profitLockOffset: number;    // 利润保护偏移金额 (USD)
  makerLossLimit: number;      // 做市商止损金额 (USD)
  makerPriceChase: number;     // 做市商追价阈值 (价格单位)
  bidAskOffset: number;        // 买卖单偏移 (价格单位)
  // 高频交易参数
  minHoldTimeMs: number;       // 最小持仓时间
  maxPositionSize: number;     // 最大仓位规模
  priceThreshold: number;      // 价格变化阈值
}

export class DynamicRiskManager {
  private config: DynamicRiskConfig;

  constructor(config: DynamicRiskConfig) {
    this.config = config;
  }

  /**
   * 根据当前价格计算风险管理参数
   */
  calculateRiskParams(currentPrice: number): DynamicRiskParams {
    const positionValue = this.config.baseAmount * currentPrice;
    
    // 基础风险参数
    const lossLimit = positionValue * this.config.riskPercentage;
    const trailingProfit = positionValue * this.config.profitTarget;
    const profitLockTrigger = trailingProfit * this.config.profitLockRatio;
    const profitLockOffset = positionValue * this.config.protectionOffset;
    
    // 做市商参数
    const makerLossLimit = lossLimit * 0.9; // 做市商风险稍小
    const makerPriceChase = currentPrice * 0.001; // 0.1%价格追逐
    const bidAskOffset = currentPrice * 0.0005; // 0.05%买卖偏移

    return {
      lossLimit: this.roundToTwoDecimals(lossLimit),
      trailingProfit: this.roundToTwoDecimals(trailingProfit),
      trailingCallbackRate: this.config.trailingCallback,
      profitLockTrigger: this.roundToTwoDecimals(profitLockTrigger),
      profitLockOffset: this.roundToTwoDecimals(profitLockOffset),
      makerLossLimit: this.roundToTwoDecimals(makerLossLimit),
      makerPriceChase: this.roundToFourDecimals(makerPriceChase),
      bidAskOffset: this.roundToFourDecimals(bidAskOffset),
      // 高频交易参数
      minHoldTimeMs: this.config.minHoldTimeMs,
      maxPositionSize: this.config.baseAmount * this.config.maxPositionMultiplier,
      priceThreshold: this.config.recalcThreshold,
    };
  }

  /**
   * 生成动态配置对象 (可用于更新引擎配置)
   */
  generateDynamicConfig(currentPrice: number) {
    const params = this.calculateRiskParams(currentPrice);
    
    return {
      LOSS_LIMIT: params.lossLimit,
      TRAILING_PROFIT: params.trailingProfit,
      TRAILING_CALLBACK_RATE: params.trailingCallbackRate,
      PROFIT_LOCK_TRIGGER_USD: params.profitLockTrigger,
      PROFIT_LOCK_OFFSET_USD: params.profitLockOffset,
      MAKER_LOSS_LIMIT: params.makerLossLimit,
      MAKER_PRICE_CHASE: params.makerPriceChase,
      MAKER_BID_OFFSET: params.bidAskOffset,
      MAKER_ASK_OFFSET: params.bidAskOffset,
    };
  }

  /**
   * 检查价格变化是否需要重新计算参数
   */
  shouldRecalculate(currentPrice: number, lastPrice: number, threshold?: number): boolean {
    if (!lastPrice || lastPrice <= 0) return true;
    
    // 使用配置的阈值或者传入的阈值
    const actualThreshold = threshold ?? this.config.recalcThreshold;
    const priceChangePercent = Math.abs((currentPrice - lastPrice) / lastPrice);
    return priceChangePercent >= actualThreshold;
  }

  /**
   * 获取参数变化摘要 (用于日志)
   */
  getUpdateSummary(newParams: DynamicRiskParams, currentPrice: number): string {
    const positionValue = this.config.baseAmount * currentPrice;
    
    return [
      `🔄 动态风险参数更新 (价格: $${currentPrice.toFixed(3)})`,
      `💰 仓位价值: $${positionValue.toFixed(2)} (${this.config.baseAmount} × $${currentPrice.toFixed(3)})`,
      `🛡️ 止损: $${newParams.lossLimit} (${(this.config.riskPercentage * 100).toFixed(1)}%)`,
      `🎯 止盈: $${newParams.trailingProfit} (${(this.config.profitTarget * 100).toFixed(1)}%)`,
      `📈 做市商风控: $${newParams.makerLossLimit}`,
    ].join(' | ');
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<DynamicRiskConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundToFourDecimals(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}

// 默认配置生成器
export function createDefaultDynamicRiskConfig(symbol: string, baseAmount: number): DynamicRiskConfig {
  return {
    symbol,
    baseAmount,
    riskPercentage: 0.008,    // 0.8% 风险 (降低以增加交易频率)
    profitTarget: 0.018,      // 1.8% 目标收益 (降低以更快止盈)
    trailingCallback: 0.008,  // 0.8% 追踪回调
    profitLockRatio: 0.75,    // 75% 时启动保护
    protectionOffset: 0.006,  // 0.6% 保护偏移 (降低以保留更多利润)
    // 高频交易参数
    minHoldTimeMs: 1000,      // 1秒最小持仓时间
    maxPositionMultiplier: 1.2, // 1.2倍最大仓位倍数
    recalcThreshold: 0.015,   // 1.5% 价格变化阈值
  };
}
