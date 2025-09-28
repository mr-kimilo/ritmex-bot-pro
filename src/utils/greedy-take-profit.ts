/**
 * 贪婪止盈策略
 * 在达到基础止盈条件后，通过分析价格趋势决定是否继续持仓等待更高收益
 */

export interface GreedyProfitConfig {
  enabled: boolean;
  sampleSize: number;        // 价格采样数组大小
  reversalThreshold: number; // 价格反转阈值（百分比）
  maxWaitTime: number;       // 最大等待时间（毫秒）
  extraProfitTarget: number; // 额外收益目标（百分比）
}

export interface GreedyProfitState {
  isActive: boolean;         // 是否处于贪婪模式
  activatedAt: number;       // 激活时间戳
  entryPrice: number;        // 开仓价格
  direction: 'long' | 'short'; // 持仓方向
  priceHistory: number[];    // 价格历史记录
  bestPrice: number;         // 最佳价格（最有利价格）
  initialProfitPercent: number; // 激活时的初始利润百分比
}

export class GreedyTakeProfitManager {
  private config: GreedyProfitConfig;
  private state: GreedyProfitState | null = null;

  constructor(config: GreedyProfitConfig) {
    this.config = config;
  }

  /**
   * 检查是否应该激活贪婪模式
   * @param currentPrice 当前价格
   * @param entryPrice 开仓价格
   * @param direction 持仓方向
   * @param baseProfitPercent 基础止盈百分比
   * @returns 是否激活贪婪模式
   */
  shouldActivateGreedy(
    currentPrice: number,
    entryPrice: number,
    direction: 'long' | 'short',
    baseProfitPercent: number
  ): boolean {
    if (!this.config.enabled || this.state?.isActive) {
      return false;
    }

    // 计算当前利润百分比
    const profitPercent = this.calculateProfitPercent(currentPrice, entryPrice, direction);
    
    // 如果达到基础止盈条件，激活贪婪模式
    if (profitPercent >= baseProfitPercent) {
      this.activateGreedy(currentPrice, entryPrice, direction, baseProfitPercent);
      return true;
    }

    return false;
  }

  /**
   * 激活贪婪模式
   */
  private activateGreedy(
    currentPrice: number,
    entryPrice: number,
    direction: 'long' | 'short',
    baseProfitPercent: number // 基础止盈百分比（如1.5%）
  ): void {
    this.state = {
      isActive: true,
      activatedAt: Date.now(),
      entryPrice,
      direction,
      priceHistory: [currentPrice],
      bestPrice: currentPrice,
      initialProfitPercent: baseProfitPercent // 使用基础止盈百分比作为起点
    };
  }

  /**
   * 更新价格并检查是否应该止盈
   * @param currentPrice 当前价格
   * @returns 是否应该立即止盈
   */
  updateAndCheckTakeProfit(currentPrice: number): {
    shouldTakeProfit: boolean;
    reason?: string;
    extraProfit?: number;
  } {
    if (!this.state?.isActive || !this.config.enabled) {
      return { shouldTakeProfit: false };
    }

    // 检查超时
    const elapsed = Date.now() - this.state.activatedAt;
    if (elapsed > this.config.maxWaitTime) {
      const extraProfit = this.calculateProfitPercent(currentPrice, this.state.entryPrice, this.state.direction);
      this.resetState();
      return { 
        shouldTakeProfit: true, 
        reason: 'greedy_timeout',
        extraProfit: extraProfit - this.state.initialProfitPercent
      };
    }

    // 更新价格历史
    this.updatePriceHistory(currentPrice);

    // 更新最佳价格
    this.updateBestPrice(currentPrice);

    // 计算当前利润百分比
    const currentProfitPercent = this.calculateProfitPercent(currentPrice, this.state.entryPrice, this.state.direction);

    // 检查是否达到额外收益目标
    if (currentProfitPercent >= this.state.initialProfitPercent + this.config.extraProfitTarget) {
      const extraProfit = currentProfitPercent - this.state.initialProfitPercent;
      this.resetState();
      return { 
        shouldTakeProfit: true, 
        reason: 'extra_profit_achieved',
        extraProfit
      };
    }

    // 检查价格反转
    if (this.detectPriceReversal(currentPrice)) {
      const extraProfit = currentProfitPercent - this.state.initialProfitPercent;
      this.resetState();
      return { 
        shouldTakeProfit: true, 
        reason: 'price_reversal_detected',
        extraProfit
      };
    }

    return { shouldTakeProfit: false };
  }

  /**
   * 更新价格历史记录
   */
  private updatePriceHistory(currentPrice: number): void {
    if (!this.state) return;

    this.state.priceHistory.push(currentPrice);

    // 保持数组大小不超过配置的采样大小
    if (this.state.priceHistory.length > this.config.sampleSize) {
      this.state.priceHistory.shift(); // 移除最早的价格
    }
  }

  /**
   * 更新最佳价格（最有利的价格）
   */
  private updateBestPrice(currentPrice: number): void {
    if (!this.state) return;

    if (this.state.direction === 'long') {
      // 多头：更高的价格更好
      this.state.bestPrice = Math.max(this.state.bestPrice, currentPrice);
    } else {
      // 空头：更低的价格更好
      this.state.bestPrice = Math.min(this.state.bestPrice, currentPrice);
    }
  }

  /**
   * 检测价格反转
   * 如果当前价格相比平均价格有不利变化，则认为发生反转
   */
  private detectPriceReversal(currentPrice: number): boolean {
    if (!this.state || this.state.priceHistory.length < 3) {
      return false;
    }

    // 计算价格历史的平均值
    const avgPrice = this.state.priceHistory.reduce((sum, price) => sum + price, 0) / this.state.priceHistory.length;

    // 计算当前价格相对于平均价格的偏差
    const deviation = (currentPrice - avgPrice) / avgPrice;

    // 根据持仓方向判断是否发生反转
    if (this.state.direction === 'long') {
      // 多头：如果价格下跌超过反转阈值，则认为发生反转
      return deviation < -this.config.reversalThreshold;
    } else {
      // 空头：如果价格上涨超过反转阈值，则认为发生反转
      return deviation > this.config.reversalThreshold;
    }
  }

  /**
   * 计算利润百分比
   */
  private calculateProfitPercent(currentPrice: number, entryPrice: number, direction: 'long' | 'short'): number {
    const priceDiff = currentPrice - entryPrice;
    const profitMultiplier = direction === 'long' ? 1 : -1;
    return (priceDiff / entryPrice) * profitMultiplier;
  }

  /**
   * 重置状态
   */
  private resetState(): void {
    this.state = null;
  }

  /**
   * 获取当前状态信息（用于UI显示）
   */
  getStateInfo(): {
    isActive: boolean;
    timeElapsed?: number;
    priceCount?: number;
    currentProfit?: number;
    extraProfitTarget?: number;
    bestPrice?: number;
    priceHistory?: number[];
    movingAverage?: number;
    activationTime?: number;
  } {
    if (!this.state?.isActive) {
      return { isActive: false };
    }

    const timeElapsed = Date.now() - this.state.activatedAt;
    const currentProfit = this.state.priceHistory.length > 0 
      ? this.calculateProfitPercent(
          this.state.priceHistory[this.state.priceHistory.length - 1]!,
          this.state.entryPrice,
          this.state.direction
        )
      : 0;

    const movingAverage = this.state.priceHistory.length >= this.config.sampleSize
      ? this.state.priceHistory.reduce((sum, price) => sum + price, 0) / this.state.priceHistory.length
      : undefined;

    return {
      isActive: true,
      timeElapsed,
      priceCount: this.state.priceHistory.length,
      currentProfit,
      extraProfitTarget: this.state.initialProfitPercent + this.config.extraProfitTarget,
      bestPrice: this.state.bestPrice,
      priceHistory: [...this.state.priceHistory],
      movingAverage,
      activationTime: this.state.activatedAt
    };
  }

  /**
   * 强制退出贪婪模式（如止损触发时）
   */
  forceExit(): void {
    this.resetState();
  }
}
