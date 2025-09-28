import type { KlineData } from './redis-kline-manager';

export interface KDJIndicator {
  k: number;
  d: number;
  j: number;
}

export interface RSIIndicator {
  rsi: number;
  overbought: boolean; // RSI > 70
  oversold: boolean;   // RSI < 30
}

export interface VolumeAnalysis {
  currentVolume: number;
  avgVolume: number;
  volumeRatio: number;
  isHighVolume: boolean; // 成交量是否异常放大
}

export interface PriceRange {
  support: number;    // 支撑位
  resistance: number; // 阻力位
  range: number;      // 区间大小
  position: number;   // 当前价格在区间中的位置 (0-1)
}

export interface TechnicalAnalysis {
  kdj: KDJIndicator;
  rsi: RSIIndicator;
  volume: VolumeAnalysis;
  priceRange: PriceRange;
  sma30: number;
  currentPrice: number;
  timestamp: number;
}

export class TechnicalIndicators {
  
  /**
   * 计算KDJ指标
   * @param klines K线数据
   * @param period 计算周期，默认14
   * @param kPeriod K值平滑周期，默认3
   * @param dPeriod D值平滑周期，默认3
   */
  static calculateKDJ(
    klines: KlineData[], 
    period: number = 14,
    kPeriod: number = 3,
    dPeriod: number = 3
  ): KDJIndicator[] {
    if (klines.length < period) return [];

    const results: KDJIndicator[] = [];
    const rsvs: number[] = [];

    // 计算RSV值
    for (let i = period - 1; i < klines.length; i++) {
      const periodData = klines.slice(i - period + 1, i + 1);
      const highest = Math.max(...periodData.map(k => k.high));
      const lowest = Math.min(...periodData.map(k => k.low));
      const current = klines[i]!.close;

      const rsv = lowest === highest ? 50 : ((current - lowest) / (highest - lowest)) * 100;
      rsvs.push(rsv);
    }

    // 计算K、D、J值
    let k = 50; // 初始K值
    let d = 50; // 初始D值
    const kValues: number[] = [];
    const dValues: number[] = [];

    for (let i = 0; i < rsvs.length; i++) {
      k = (k * (kPeriod - 1) + rsvs[i]!) / kPeriod;
      kValues.push(k);
    }

    for (const kValue of kValues) {
      d = (d * (dPeriod - 1) + kValue) / dPeriod;
      dValues.push(d);
    }

    // 生成最终结果
    for (let i = 0; i < kValues.length; i++) {
      const kVal = kValues[i]!;
      const dVal = dValues[i]!;
      const jVal = 3 * kVal - 2 * dVal;

      results.push({
        k: Number(kVal.toFixed(2)),
        d: Number(dVal.toFixed(2)),
        j: Number(jVal.toFixed(2))
      });
    }

    return results;
  }

  /**
   * 计算RSI指标
   */
  static calculateRSI(klines: KlineData[], period: number = 14): RSIIndicator[] {
    if (klines.length < period + 1) return [];

    const results: RSIIndicator[] = [];
    let avgGain = 0;
    let avgLoss = 0;

    // 计算初始平均涨跌幅
    for (let i = 1; i <= period; i++) {
      const change = klines[i]!.close - klines[i - 1]!.close;
      if (change > 0) {
        avgGain += change;
      } else {
        avgLoss += Math.abs(change);
      }
    }
    avgGain /= period;
    avgLoss /= period;

    // 计算RSI
    for (let i = period; i < klines.length; i++) {
      const change = klines[i]!.close - klines[i - 1]!.close;
      
      if (change > 0) {
        avgGain = ((avgGain * (period - 1)) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = ((avgLoss * (period - 1)) + Math.abs(change)) / period;
      }

      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));

      results.push({
        rsi: Number(rsi.toFixed(2)),
        overbought: rsi > 70,
        oversold: rsi < 30
      });
    }

    return results;
  }

  /**
   * 分析成交量
   */
  static analyzeVolume(klines: KlineData[], period: number = 20): VolumeAnalysis | null {
    if (klines.length < period) return null;

    const recentVolumes = klines.slice(-period).map(k => k.volume);
    const currentVolume = klines[klines.length - 1]!.volume;
    const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / period;
    const volumeRatio = currentVolume / avgVolume;

    return {
      currentVolume: Number(currentVolume.toFixed(2)),
      avgVolume: Number(avgVolume.toFixed(2)),
      volumeRatio: Number(volumeRatio.toFixed(2)),
      isHighVolume: volumeRatio > 1.5 // 成交量放大50%以上
    };
  }

  /**
   * 分析价格区间
   */
  static analyzePriceRange(klines: KlineData[], hours: number = 3): PriceRange | null {
    if (klines.length === 0) return null;

    const hoursMs = hours * 60 * 60 * 1000;
    const cutoffTime = Date.now() - hoursMs;
    
    // 获取指定时间内的K线
    const recentKlines = klines.filter(k => k.timestamp >= cutoffTime);
    if (recentKlines.length === 0) return null;

    const highs = recentKlines.map(k => k.high);
    const lows = recentKlines.map(k => k.low);
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    const range = resistance - support;
    const currentPrice = klines[klines.length - 1]!.close;
    
    // 计算当前价格在区间中的位置 (0=支撑位, 1=阻力位)
    const position = range === 0 ? 0.5 : (currentPrice - support) / range;

    return {
      support: Number(support.toFixed(4)),
      resistance: Number(resistance.toFixed(4)),
      range: Number(range.toFixed(4)),
      position: Number(position.toFixed(3))
    };
  }

  /**
   * 计算简单移动平均线
   */
  static calculateSMA(klines: KlineData[], period: number): number[] {
    if (klines.length < period) return [];

    const smas: number[] = [];
    
    for (let i = period - 1; i < klines.length; i++) {
      const sum = klines.slice(i - period + 1, i + 1)
        .reduce((total, kline) => total + kline.close, 0);
      smas.push(sum / period);
    }

    return smas;
  }

  /**
   * 获取KDJ交易信号
   */
  static getKDJSignal(kdj: KDJIndicator): 'BUY' | 'SELL' | 'HOLD' {
    const { k, d, j } = kdj;

    // 金叉买入信号：K线从下方突破D线，且都在超卖区域(< 20)
    if (k > d && k < 20 && d < 20) {
      return 'BUY';
    }

    // 死叉卖出信号：K线从上方跌破D线，且都在超买区域(> 80)  
    if (k < d && k > 80 && d > 80) {
      return 'SELL';
    }

    // J值极值信号
    if (j < 10) return 'BUY';   // J值超卖
    if (j > 90) return 'SELL';  // J值超买

    return 'HOLD';
  }

  /**
   * 获取成交量确认信号
   */
  static getVolumeConfirmation(volume: VolumeAnalysis, priceDirection: 'UP' | 'DOWN'): boolean {
    // 价格上涨时，成交量放大确认上涨
    if (priceDirection === 'UP') {
      return volume.isHighVolume;
    }
    
    // 价格下跌时，成交量放大确认下跌
    if (priceDirection === 'DOWN') {
      return volume.isHighVolume;
    }

    return false;
  }

  /**
   * 综合技术分析
   */
  static performComprehensiveAnalysis(klines: KlineData[]): TechnicalAnalysis | null {
    if (klines.length < 30) return null;

    try {
      // 计算各项指标
      const kdjResults = this.calculateKDJ(klines);
      const rsiResults = this.calculateRSI(klines);
      const volumeAnalysis = this.analyzeVolume(klines);
      const priceRange = this.analyzePriceRange(klines);
      const sma30Values = this.calculateSMA(klines, 30);

      if (kdjResults.length === 0 || rsiResults.length === 0 || 
          !volumeAnalysis || !priceRange || sma30Values.length === 0) {
        return null;
      }

      // 获取最新值
      const latestKDJ = kdjResults[kdjResults.length - 1]!;
      const latestRSI = rsiResults[rsiResults.length - 1]!;
      const latestSMA30 = sma30Values[sma30Values.length - 1]!;
      const currentPrice = klines[klines.length - 1]!.close;

      return {
        kdj: latestKDJ,
        rsi: latestRSI,
        volume: volumeAnalysis,
        priceRange,
        sma30: Number(latestSMA30.toFixed(4)),
        currentPrice: Number(currentPrice.toFixed(4)),
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('❌ 技术分析计算失败:', error);
      return null;
    }
  }

  /**
   * 计算波动性（用于动态调整参数）
   */
  static calculateVolatility(klines: KlineData[], period: number = 20): number {
    if (klines.length < period) return 0;

    const returns: number[] = [];
    
    // 计算对数收益率
    for (let i = 1; i < Math.min(klines.length, period + 1); i++) {
      const current = klines[klines.length - i]!.close;
      const previous = klines[klines.length - i - 1]!.close;
      returns.push(Math.log(current / previous));
    }

    // 计算标准差
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * Math.sqrt(252); // 年化波动率
  }

  /**
   * 获取市场状态描述
   */
  static getMarketState(analysis: TechnicalAnalysis): {
    trend: string;
    strength: string;
    risk: string;
    recommendation: string;
  } {
    const { kdj, rsi, volume, priceRange, sma30, currentPrice } = analysis;

    // 趋势判断
    let trend = '震荡';
    if (currentPrice > sma30 * 1.02) trend = '上涨';
    else if (currentPrice < sma30 * 0.98) trend = '下跌';

    // 强度判断
    let strength = '中等';
    if (volume.isHighVolume) strength = '强';
    if (volume.volumeRatio < 0.7) strength = '弱';

    // 风险评估
    let risk = '中等';
    if (rsi.overbought || kdj.k > 80) risk = '高';
    if (rsi.oversold || kdj.k < 20) risk = '低';

    // 操作建议
    let recommendation = '观望';
    const kdjSignal = this.getKDJSignal(kdj);
    
    if (kdjSignal === 'BUY' && !rsi.overbought && priceRange.position < 0.8) {
      recommendation = '买入';
    } else if (kdjSignal === 'SELL' && !rsi.oversold && priceRange.position > 0.2) {
      recommendation = '卖出';
    }

    return { trend, strength, risk, recommendation };
  }
}
