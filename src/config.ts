export interface TradingConfig {
  symbol: string;
  tradeAmount: number;
  lossLimit: number;
  trailingProfit: number;
  trailingCallbackRate: number;
  profitLockTriggerUsd: number;
  profitLockOffsetUsd: number;
  pollIntervalMs: number;
  maxLogEntries: number;
  klineInterval: string;
  maxCloseSlippagePct: number;
  priceTick: number; // price tick size, e.g. 0.1 for BTCUSDT
  qtyStep: number;   // quantity step size, e.g. 0.001 BTC
  // Fee monitoring settings
  feeRate: number;
  maxDailyFeePct: number;
  maxHourlyFeePct: number;
  feeWarningThreshold: number;
  enableFeeProtection: boolean;
  logFeeSummaryInterval: number;
  resetFeeCounterHour: number;
  // Dynamic risk management settings
  enableDynamicRisk: boolean;
  dynamicRiskThreshold: number; // 价格变化阈值 (如 0.05 = 5%)
  riskPercentage: number;       // 风险百分比
  profitTargetPercentage: number; // 目标收益百分比
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === 'true';
}

export const tradingConfig: TradingConfig = {
  symbol: process.env.TRADE_SYMBOL ?? "BTCUSDT",
  tradeAmount: parseNumber(process.env.TRADE_AMOUNT, 0.001),
  lossLimit: parseNumber(process.env.LOSS_LIMIT, 0.03),
  trailingProfit: parseNumber(process.env.TRAILING_PROFIT, 0.2),
  trailingCallbackRate: parseNumber(process.env.TRAILING_CALLBACK_RATE, 0.2),
  profitLockTriggerUsd: parseNumber(process.env.PROFIT_LOCK_TRIGGER_USD, 0.1),
  profitLockOffsetUsd: parseNumber(process.env.PROFIT_LOCK_OFFSET_USD, 0.05),
  pollIntervalMs: parseNumber(process.env.POLL_INTERVAL_MS, 500),
  maxLogEntries: parseNumber(process.env.MAX_LOG_ENTRIES, 200),
  klineInterval: process.env.KLINE_INTERVAL ?? "1m",
  maxCloseSlippagePct: parseNumber(process.env.MAX_CLOSE_SLIPPAGE_PCT, 0.05),
  priceTick: parseNumber(process.env.PRICE_TICK, 0.1),
  qtyStep: parseNumber(process.env.QTY_STEP, 0.001),
  // Fee monitoring
  feeRate: parseNumber(process.env.FEE_RATE, 0.0004),
  maxDailyFeePct: parseNumber(process.env.MAX_DAILY_FEE_PCT, 2.0),
  maxHourlyFeePct: parseNumber(process.env.MAX_HOURLY_FEE_PCT, 0.5),
  feeWarningThreshold: parseNumber(process.env.FEE_WARNING_THRESHOLD, 1.0),
  enableFeeProtection: parseBoolean(process.env.ENABLE_FEE_PROTECTION, true),
  logFeeSummaryInterval: parseNumber(process.env.LOG_FEE_SUMMARY_INTERVAL, 300000),
  resetFeeCounterHour: parseNumber(process.env.RESET_FEE_COUNTER_HOUR, 0),
  // Dynamic risk management
  enableDynamicRisk: parseBoolean(process.env.ENABLE_DYNAMIC_RISK, false),
  dynamicRiskThreshold: parseNumber(process.env.DYNAMIC_RISK_THRESHOLD, 0.05),
  riskPercentage: parseNumber(process.env.RISK_PERCENTAGE, 0.01),
  profitTargetPercentage: parseNumber(process.env.PROFIT_TARGET_PERCENTAGE, 0.02),
};

export interface MakerConfig {
  symbol: string;
  tradeAmount: number;
  lossLimit: number;
  profitTarget: number;
  priceChaseThreshold: number;
  bidOffset: number;
  askOffset: number;
  refreshIntervalMs: number;
  maxLogEntries: number;
  maxCloseSlippagePct: number;
  priceTick: number;
}

export const makerConfig: MakerConfig = {
  symbol: process.env.TRADE_SYMBOL ?? "BTCUSDT",
  tradeAmount: parseNumber(process.env.TRADE_AMOUNT, 0.001),
  lossLimit: parseNumber(process.env.MAKER_LOSS_LIMIT, parseNumber(process.env.LOSS_LIMIT, 0.03)),
  profitTarget: parseNumber(process.env.MAKER_PROFIT_TARGET, 0.5),
  priceChaseThreshold: parseNumber(process.env.MAKER_PRICE_CHASE, 0.3),
  bidOffset: parseNumber(process.env.MAKER_BID_OFFSET, 0),
  askOffset: parseNumber(process.env.MAKER_ASK_OFFSET, 0),
  refreshIntervalMs: parseNumber(process.env.MAKER_REFRESH_INTERVAL_MS, 1500),
  maxLogEntries: parseNumber(process.env.MAKER_MAX_LOG_ENTRIES, 200),
  maxCloseSlippagePct: parseNumber(
    process.env.MAKER_MAX_CLOSE_SLIPPAGE_PCT ?? process.env.MAX_CLOSE_SLIPPAGE_PCT,
    0.05
  ),
  priceTick: parseNumber(process.env.MAKER_PRICE_TICK ?? process.env.PRICE_TICK, 0.1),
};

// Redis配置
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  cacheTtl: number;
  maxKlines: number;
}

export const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseNumber(process.env.REDIS_PORT, 6379),
  password: process.env.REDIS_PASSWORD,
  cacheTtl: parseNumber(process.env.REDIS_CACHE_TTL, 3600), // 1小时
  maxKlines: parseNumber(process.env.REDIS_MAX_KLINES, 200), // 最大K线数量
};

// 技术分析配置
export interface TechnicalAnalysisConfig {
  kdjPeriod: number;
  rsiPeriod: number;
  volumeMaPeriod: number;
  confidenceThreshold: number;
  priceRangeHours: number;
  volatilityPeriod: number;
  minVolumeRatio: number;
  enableEnhancedAnalysis: boolean;
}

export const technicalAnalysisConfig: TechnicalAnalysisConfig = {
  kdjPeriod: parseNumber(process.env.KDJ_PERIOD, 14),
  rsiPeriod: parseNumber(process.env.RSI_PERIOD, 14),
  volumeMaPeriod: parseNumber(process.env.VOLUME_MA_PERIOD, 20),
  confidenceThreshold: parseNumber(process.env.CONFIDENCE_THRESHOLD, 0.7),
  priceRangeHours: parseNumber(process.env.PRICE_RANGE_HOURS, 3),
  volatilityPeriod: parseNumber(process.env.VOLATILITY_PERIOD, 20),
  minVolumeRatio: parseNumber(process.env.MIN_VOLUME_RATIO, 0.8),
  enableEnhancedAnalysis: parseBoolean(process.env.ENABLE_ENHANCED_ANALYSIS, false),
};
