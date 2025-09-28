import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * 手续费监控测试脚本
 * 测试手续费统计功能是否正常工作
 */

// Mock FeeMonitor class to test independently
class MockFeeMonitor {
  private fees: Array<{ timestamp: number; amount: number; side: string; symbol: string }> = [];
  private totalFee = 0;
  private dailyFee = 0;
  private hourlyFee = 0;
  private tradeCount = 0;
  private currentBalance = 1000; // Mock balance
  
  private config = {
    feeRate: 0.0004, // 0.04%
    maxDailyFeePct: 0.02, // 2%
    maxHourlyFeePct: 0.005, // 0.5%
    feeWarningThreshold: 0.001, // 0.1%
    enableFeeProtection: true,
    logInterval: 30000
  };
  
  constructor(config?: Partial<typeof this.config>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }
  
  updateBalance(balance: number) {
    this.currentBalance = balance;
  }
  
  recordTrade(symbol: string, side: string, quantity: number, price: number, fee: number) {
    const timestamp = Date.now();
    this.fees.push({ timestamp, amount: fee, side, symbol });
    this.totalFee += fee;
    this.tradeCount++;
    
    // 计算日手续费
    const oneDayAgo = timestamp - 24 * 60 * 60 * 1000;
    this.dailyFee = this.fees
      .filter(f => f.timestamp >= oneDayAgo)
      .reduce((sum, f) => sum + f.amount, 0);
    
    // 计算小时手续费
    const oneHourAgo = timestamp - 60 * 60 * 1000;
    this.hourlyFee = this.fees
      .filter(f => f.timestamp >= oneHourAgo)
      .reduce((sum, f) => sum + f.amount, 0);
  }
  
  getFeeStats() {
    return {
      totalFee: this.totalFee,
      dailyFee: this.dailyFee,
      hourlyFee: this.hourlyFee,
      tradeCount: this.tradeCount,
      dailyFeePct: this.currentBalance > 0 ? this.dailyFee / this.currentBalance : 0,
      hourlyFeePct: this.currentBalance > 0 ? this.hourlyFee / this.currentBalance : 0,
      avgFeePerTrade: this.tradeCount > 0 ? this.totalFee / this.tradeCount : 0,
      actualFeeRate: this.tradeCount > 0 ? this.totalFee / (this.tradeCount * 100) : 0
    };
  }
  
  shouldStopTrading(): boolean {
    const stats = this.getFeeStats();
    return (
      (this.config.enableFeeProtection && stats.dailyFeePct > this.config.maxDailyFeePct) ||
      (this.config.enableFeeProtection && stats.hourlyFeePct > this.config.maxHourlyFeePct)
    );
  }
}

describe('手续费监控测试', () => {
  let feeMonitor: MockFeeMonitor;
  
  beforeEach(() => {
    feeMonitor = new MockFeeMonitor();
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  it('应该正确初始化手续费监控器', () => {
    const stats = feeMonitor.getFeeStats();
    expect(stats.totalFee).toBe(0);
    expect(stats.dailyFee).toBe(0);
    expect(stats.hourlyFee).toBe(0);
    expect(stats.tradeCount).toBe(0);
  });
  
  it('应该正确记录单笔交易手续费', () => {
    const symbol = 'ASTERUSDT';
    const side = 'BUY';
    const quantity = 20;
    const price = 2.10;
    const expectedFee = quantity * price * 0.0004; // $0.0168
    
    feeMonitor.recordTrade(symbol, side, quantity, price, expectedFee);
    
    const stats = feeMonitor.getFeeStats();
    expect(stats.totalFee).toBeCloseTo(expectedFee, 6);
    expect(stats.dailyFee).toBeCloseTo(expectedFee, 6);
    expect(stats.hourlyFee).toBeCloseTo(expectedFee, 6);
    expect(stats.tradeCount).toBe(1);
    expect(stats.avgFeePerTrade).toBeCloseTo(expectedFee, 6);
  });
  
  it('应该正确计算多笔交易的累计手续费', () => {
    const trades = [
      { symbol: 'ASTERUSDT', side: 'BUY', quantity: 20, price: 2.10, fee: 0.0168 },
      { symbol: 'ASTERUSDT', side: 'SELL', quantity: 20, price: 2.12, fee: 0.0169 },
      { symbol: 'ASTERUSDT', side: 'BUY', quantity: 25, price: 2.08, fee: 0.0208 },
    ];
    
    trades.forEach(trade => {
      feeMonitor.recordTrade(trade.symbol, trade.side, trade.quantity, trade.price, trade.fee);
    });
    
    const expectedTotal = trades.reduce((sum, t) => sum + t.fee, 0);
    const stats = feeMonitor.getFeeStats();
    
    expect(stats.totalFee).toBeCloseTo(expectedTotal, 4);
    expect(stats.tradeCount).toBe(3);
    expect(stats.avgFeePerTrade).toBeCloseTo(expectedTotal / 3, 4);
  });
  
  it('应该正确计算手续费百分比', () => {
    const balance = 1000;
    feeMonitor.updateBalance(balance);
    
    const fee = 5; // $5 手续费
    feeMonitor.recordTrade('ASTERUSDT', 'BUY', 100, 2.00, fee);
    
    const stats = feeMonitor.getFeeStats();
    expect(stats.dailyFeePct).toBe(0.005); // 0.5%
    expect(stats.hourlyFeePct).toBe(0.005); // 0.5%
  });
  
  it('应该在日手续费超过阈值时停止交易', () => {
    const balance = 1000;
    feeMonitor = new MockFeeMonitor({
      maxDailyFeePct: 0.02, // 2%
      enableFeeProtection: true
    });
    feeMonitor.updateBalance(balance);
    
    // 记录高手续费交易（2.5% > 2%）
    const highFee = balance * 0.025;
    feeMonitor.recordTrade('ASTERUSDT', 'BUY', 100, 2.00, highFee);
    
    expect(feeMonitor.shouldStopTrading()).toBe(true);
  });
  
  it('应该在小时手续费超过阈值时停止交易', () => {
    const balance = 1000;
    feeMonitor = new MockFeeMonitor({
      maxHourlyFeePct: 0.005, // 0.5%
      enableFeeProtection: true
    });
    feeMonitor.updateBalance(balance);
    
    // 记录高手续费交易（0.8% > 0.5%）
    const highFee = balance * 0.008;
    feeMonitor.recordTrade('ASTERUSDT', 'BUY', 100, 2.00, highFee);
    
    expect(feeMonitor.shouldStopTrading()).toBe(true);
  });
  
  it('应该正确处理时间窗口内的手续费计算', () => {
    const balance = 1000;
    feeMonitor.updateBalance(balance);
    
    // 记录第一笔交易
    const fee1 = 2;
    feeMonitor.recordTrade('ASTERUSDT', 'BUY', 100, 2.00, fee1);
    
    // 1小时后
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    
    // 记录第二笔交易
    const fee2 = 3;
    feeMonitor.recordTrade('ASTERUSDT', 'SELL', 100, 2.01, fee2);
    
    const stats = feeMonitor.getFeeStats();
    expect(stats.totalFee).toBe(fee1 + fee2); // 总手续费应该包含两笔
    expect(stats.hourlyFee).toBe(fee2); // 小时手续费只包含最近一笔
    expect(stats.dailyFee).toBe(fee1 + fee2); // 日手续费包含两笔
  });
  
  it('应该正确处理零余额情况', () => {
    feeMonitor.updateBalance(0);
    feeMonitor.recordTrade('ASTERUSDT', 'BUY', 20, 2.10, 0.0168);
    
    const stats = feeMonitor.getFeeStats();
    expect(stats.dailyFeePct).toBe(0);
    expect(stats.hourlyFeePct).toBe(0);
  });
  
  it('应该在禁用保护时不停止交易', () => {
    const balance = 1000;
    feeMonitor = new MockFeeMonitor({
      maxDailyFeePct: 0.02,
      enableFeeProtection: false // 禁用保护
    });
    feeMonitor.updateBalance(balance);
    
    // 记录超高手续费交易
    const veryHighFee = balance * 0.1; // 10%
    feeMonitor.recordTrade('ASTERUSDT', 'BUY', 100, 2.00, veryHighFee);
    
    expect(feeMonitor.shouldStopTrading()).toBe(false);
  });
});

// 实际手续费计算测试
describe('ASTER交易手续费计算测试', () => {
  let feeMonitor: MockFeeMonitor;
  
  beforeEach(() => {
    feeMonitor = new MockFeeMonitor({
      feeRate: 0.0004 // ASTER实际费率 0.04%
    });
    feeMonitor.updateBalance(1000); // $1000 账户余额
  });
  
  it('应该正确计算ASTER买入手续费', () => {
    const quantity = 20; // 20 ASTER
    const price = 2.10; // $2.10
    const tradeValue = quantity * price; // $42
    const expectedFee = tradeValue * 0.0004; // $0.0168
    
    feeMonitor.recordTrade('ASTERUSDT', 'BUY', quantity, price, expectedFee);
    
    const stats = feeMonitor.getFeeStats();
    expect(stats.totalFee).toBeCloseTo(0.0168, 4);
    expect(stats.dailyFeePct).toBeCloseTo(0.0000168, 7); // 相对于$1000
  });
  
  it('应该正确计算ASTER卖出手续费', () => {
    const quantity = 25; // 25 ASTER
    const price = 2.08; // $2.08
    const tradeValue = quantity * price; // $52
    const expectedFee = tradeValue * 0.0004; // $0.0208
    
    feeMonitor.recordTrade('ASTERUSDT', 'SELL', quantity, price, expectedFee);
    
    const stats = feeMonitor.getFeeStats();
    expect(stats.totalFee).toBeCloseTo(0.0208, 4);
  });
  
  it('应该正确计算一轮完整交易的手续费', () => {
    // 开多仓
    const openQuantity = 20;
    const openPrice = 2.10;
    const openFee = openQuantity * openPrice * 0.0004;
    feeMonitor.recordTrade('ASTERUSDT', 'BUY', openQuantity, openPrice, openFee);
    
    // 平仓获利
    const closeQuantity = 20;
    const closePrice = 2.12; // 获利 $0.02 * 20 = $0.40
    const closeFee = closeQuantity * closePrice * 0.0004;
    feeMonitor.recordTrade('ASTERUSDT', 'SELL', closeQuantity, closePrice, closeFee);
    
    const totalFee = openFee + closeFee;
    const grossProfit = (closePrice - openPrice) * openQuantity; // $0.40
    const netProfit = grossProfit - totalFee;
    
    const stats = feeMonitor.getFeeStats();
    expect(stats.totalFee).toBeCloseTo(totalFee, 4);
    expect(stats.tradeCount).toBe(2);
    expect(netProfit).toBeCloseTo(0.40 - totalFee, 4);
    
    console.log(`开仓手续费: $${openFee.toFixed(4)}`);
    console.log(`平仓手续费: $${closeFee.toFixed(4)}`);
    console.log(`总手续费: $${totalFee.toFixed(4)}`);
    console.log(`毛利润: $${grossProfit.toFixed(2)}`);
    console.log(`净利润: $${netProfit.toFixed(4)}`);
  });
  
  it('应该模拟高频交易的手续费累积', () => {
    const trades = [];
    let totalVolume = 0;
    
    // 模拟10次交易
    for (let i = 0; i < 10; i++) {
      const isBuy = i % 2 === 0;
      const quantity = 20 + Math.random() * 10; // 20-30 ASTER
      const basePrice = 2.10;
      const price = basePrice + (Math.random() - 0.5) * 0.1; // ±$0.05 波动
      const tradeValue = quantity * price;
      const fee = tradeValue * 0.0004;
      
      totalVolume += tradeValue;
      trades.push({ quantity, price, fee, tradeValue });
      
      feeMonitor.recordTrade('ASTERUSDT', isBuy ? 'BUY' : 'SELL', quantity, price, fee);
    }
    
    const stats = feeMonitor.getFeeStats();
    const expectedTotalFee = trades.reduce((sum, t) => sum + t.fee, 0);
    
    expect(stats.totalFee).toBeCloseTo(expectedTotalFee, 4);
    expect(stats.tradeCount).toBe(10);
    expect(stats.avgFeePerTrade).toBeCloseTo(expectedTotalFee / 10, 4);
    
    console.log(`总交易量: $${totalVolume.toFixed(2)}`);
    console.log(`总手续费: $${stats.totalFee.toFixed(4)}`);
    console.log(`手续费率: ${((stats.totalFee / totalVolume) * 100).toFixed(4)}%`);
    console.log(`平均每笔手续费: $${stats.avgFeePerTrade.toFixed(4)}`);
  });
});
