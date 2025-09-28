export interface FeeRecord {
  timestamp: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fee: number;
  orderId: string;
}

export interface FeeSummary {
  totalFee: number;
  totalVolume: number;
  tradeCount: number;
  avgFeeRate: number;
  dailyFee: number;
  hourlyFee: number;
  dailyFeePercent: number;
  hourlyFeePercent: number;
}

export interface FeeStats {
  totalFee: number;
  dailyFee: number;
  dailyFeePercent: number;
  hourlyFeePercent: number;
  tradeCount: number;
  avgFeeRate: number;
  isWarning: boolean;
  shouldStop: boolean;
  feeEfficiency: number;
}

export class FeeMonitor {
  private feeRecords: FeeRecord[] = [];
  private totalBalance: number = 0;
  private feeRate: number;
  private maxDailyFeePct: number;
  private maxHourlyFeePct: number;
  private feeWarningThreshold: number;
  private enableFeeProtection: boolean;
  private lastLogTime: number = 0;
  private logInterval: number;

  constructor(config: {
    feeRate: number;
    maxDailyFeePct: number;
    maxHourlyFeePct: number;
    feeWarningThreshold: number;
    enableFeeProtection: boolean;
    logInterval: number;
  }) {
    this.feeRate = config.feeRate;
    this.maxDailyFeePct = config.maxDailyFeePct;
    this.maxHourlyFeePct = config.maxHourlyFeePct;
    this.feeWarningThreshold = config.feeWarningThreshold;
    this.enableFeeProtection = config.enableFeeProtection;
    this.logInterval = config.logInterval;
  }

  updateBalance(balance: number): void {
    const previousBalance = this.totalBalance;
    this.totalBalance = balance;
    
    // 添加调试日志（可通过环境变量控制）
    if (process.env.DEBUG_FEE_MONITOR === 'true') {
      console.log(`📊 [FeeMonitor] 余额更新: $${previousBalance.toFixed(2)} → $${balance.toFixed(2)}`);
    }
  }

  recordTrade(trade: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    orderId: string;
  }): { shouldStop: boolean; reason?: string } {
    const tradeValue = trade.quantity * trade.price;
    const fee = tradeValue * this.feeRate;
    
    const feeRecord: FeeRecord = {
      timestamp: Date.now(),
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      fee: fee,
      orderId: trade.orderId
    };

    this.feeRecords.push(feeRecord);
    this.cleanOldRecords();
    
    // 添加调试日志（可通过环境变量控制）
    if (process.env.DEBUG_FEE_MONITOR === 'true') {
      console.log(`📊 [FeeMonitor] 记录交易: ${trade.side} ${trade.quantity} ${trade.symbol} @ ${trade.price}, 手续费: $${fee.toFixed(4)}`);
    }
    
    // 检查是否需要记录日志
    if (Date.now() - this.lastLogTime > this.logInterval) {
      this.logFeeSummary();
      this.lastLogTime = Date.now();
    }

    // 检查手续费保护
    if (this.enableFeeProtection && this.shouldStopTrading()) {
      // 重要警告始终显示
      console.log(`🚨 [FeeMonitor] 手续费保护触发，建议暂停交易`);
      return { shouldStop: true, reason: 'fee_limit_exceeded' };
    }

    return { shouldStop: false };
  }

  getFeeSummary(): FeeSummary {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    const allTimeFees = this.feeRecords;
    const dailyFees = this.feeRecords.filter(r => r.timestamp > oneDayAgo);
    const hourlyFees = this.feeRecords.filter(r => r.timestamp > oneHourAgo);

    const totalFee = allTimeFees.reduce((sum, r) => sum + r.fee, 0);
    const totalVolume = allTimeFees.reduce((sum, r) => sum + (r.quantity * r.price), 0);
    const dailyFee = dailyFees.reduce((sum, r) => sum + r.fee, 0);
    const hourlyFee = hourlyFees.reduce((sum, r) => sum + r.fee, 0);

    return {
      totalFee,
      totalVolume,
      tradeCount: allTimeFees.length,
      avgFeeRate: totalVolume > 0 ? totalFee / totalVolume : 0,
      dailyFee,
      hourlyFee,
      dailyFeePercent: this.totalBalance > 0 ? (dailyFee / this.totalBalance) * 100 : 0,
      hourlyFeePercent: this.totalBalance > 0 ? (hourlyFee / this.totalBalance) * 100 : 0
    };
  }

  shouldStopTrading(): boolean {
    const summary = this.getFeeSummary();
    
    return summary.dailyFeePercent > this.maxDailyFeePct || 
           summary.hourlyFeePercent > this.maxHourlyFeePct;
  }

  shouldWarn(): boolean {
    const summary = this.getFeeSummary();
    return summary.dailyFeePercent > this.feeWarningThreshold;
  }

  logFeeSummary(): void {
    const summary = this.getFeeSummary();
    
    // 只在调试模式下显示详细的手续费报告
    if (process.env.DEBUG_FEE_MONITOR === 'true') {
      console.log(`💰 [FeeMonitor] 手续费汇总报告:`);
      console.log(`   📊 累计手续费: $${summary.totalFee.toFixed(4)} USDT`);
      console.log(`   📈 今日手续费: $${summary.dailyFee.toFixed(4)} (${summary.dailyFeePercent.toFixed(2)}% 总资金)`);
      console.log(`   ⏱️  小时手续费: $${summary.hourlyFee.toFixed(4)} (${summary.hourlyFeePercent.toFixed(2)}% 总资金)`);
      console.log(`   🔄 交易笔数: ${summary.tradeCount}`);
      console.log(`   💹 累计成交额: $${summary.totalVolume.toFixed(2)} USDT`);
      console.log(`   📋 实际费率: ${(summary.avgFeeRate * 100).toFixed(4)}%`);
    }
    
    // 重要警告始终显示（无论是否在调试模式）
    if (summary.dailyFeePercent > this.feeWarningThreshold) {
      console.log(`⚠️  [FeeMonitor] 今日手续费占比较高: ${summary.dailyFeePercent.toFixed(2)}%`);
    }
    
    if (this.shouldStopTrading()) {
      console.log(`🚨 [FeeMonitor] 手续费超过限制，建议暂停交易!`);
    }
  }

  private cleanOldRecords(): void {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    this.feeRecords = this.feeRecords.filter(r => r.timestamp > twoDaysAgo);
  }

  // 获取手续费统计用于UI显示
  getFeeStats(): FeeStats {
    const summary = this.getFeeSummary();
    
    return {
      totalFee: summary.totalFee,
      dailyFee: summary.dailyFee,
      dailyFeePercent: summary.dailyFeePercent,
      hourlyFeePercent: summary.hourlyFeePercent,
      tradeCount: summary.tradeCount,
      avgFeeRate: summary.avgFeeRate,
      isWarning: this.shouldWarn(),
      shouldStop: this.shouldStopTrading(),
      feeEfficiency: summary.totalVolume > 0 ? summary.totalFee / summary.tradeCount : 0 // 每笔平均手续费
    };
  }
}
