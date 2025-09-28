import { RedisKlineManager, type KlineData } from './redis-kline-manager';
import { TechnicalIndicators, type TechnicalAnalysis } from './technical-indicators';
import type { ExchangeAdapter } from '../exchanges/adapter';

export interface MarketAnalysisResult {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-1，信号置信度
  reasons: string[]; // 决策理由
  analysis: TechnicalAnalysis;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedAction: string;
}

export interface MarketAnalyzerConfig {
  kdjPeriod: number;
  rsiPeriod: number;
  volumeMaPeriod: number;
  confidenceThreshold: number;
  priceRangeHours: number;
  volatilityPeriod: number;
  minVolumeRatio: number;
  priceRangePeriod: number;
  overboughtLevel: number;
  oversoldLevel: number;
  highVolumeThreshold: number;
  cacheTTL: number;
}

export class MarketAnalyzer {
  private klineManager: RedisKlineManager;
  private config: MarketAnalyzerConfig;
  private lastAnalysis: Map<string, MarketAnalysisResult> = new Map();

  constructor(klineManager: RedisKlineManager, config: MarketAnalyzerConfig) {
    this.klineManager = klineManager;
    this.config = config;
  }

  /**
   * 执行综合市场分析
   */
  async analyze(
    exchange: ExchangeAdapter,
    symbol: string,
    forceRefresh: boolean = false
  ): Promise<MarketAnalysisResult | null> {
    try {
      console.log(`🔍 开始分析${symbol}市场状况...`);

      // 检查是否需要刷新数据
      const needsRefresh = await this.klineManager.needsRefresh(symbol, '15m') || forceRefresh;
      
      if (needsRefresh) {
        console.log(`📊 刷新${symbol}的K线数据...`);
        
        // 获取最近1天的15分钟K线 (96根K线)
        const klines = await this.klineManager.fetchKlinesFromExchange(
          exchange,
          symbol,
          '15m',
          96
        );
        
        if (klines.length > 0) {
          await this.klineManager.storeKlines(klines);
        }
      }

      // 从Redis获取K线数据
      const klines = await this.klineManager.getKlines(symbol, '15m');
      
      if (klines.length < 30) {
        console.log(`⚠️ ${symbol}K线数据不足，无法进行分析`);
        return null;
      }

      // 执行技术分析
      const technicalAnalysis = TechnicalIndicators.performComprehensiveAnalysis(klines);
      
      if (!technicalAnalysis) {
        console.log(`❌ ${symbol}技术分析失败`);
        return null;
      }

      // 生成交易信号
      const analysisResult = this.generateTradingSignal(technicalAnalysis, klines);
      
      // 缓存结果
      this.lastAnalysis.set(symbol, analysisResult);
      
      // 存储到Redis
      await this.klineManager.storeAnalysis(symbol, analysisResult);
      
      console.log(`✅ ${symbol}市场分析完成 - 信号: ${analysisResult.signal}, 置信度: ${(analysisResult.confidence * 100).toFixed(1)}%`);
      
      return analysisResult;

    } catch (error) {
      console.error(`❌ ${symbol}市场分析失败:`, error);
      return null;
    }
  }

  /**
   * 生成交易信号
   */
  private generateTradingSignal(analysis: TechnicalAnalysis, klines: KlineData[]): MarketAnalysisResult {
    const { kdj, rsi, volume, priceRange, sma30, currentPrice } = analysis;
    
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    const reasons: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';

    // KDJ信号分析
    const kdjSignal = TechnicalIndicators.getKDJSignal(kdj);
    let kdjScore = 0;
    
    if (kdjSignal === 'BUY') {
      kdjScore = 0.3;
      reasons.push(`KDJ金叉信号 (K:${kdj.k}, D:${kdj.d})`);
    } else if (kdjSignal === 'SELL') {
      kdjScore = -0.3;
      reasons.push(`KDJ死叉信号 (K:${kdj.k}, D:${kdj.d})`);
    }

    // RSI信号分析
    let rsiScore = 0;
    if (rsi.oversold) {
      rsiScore = 0.25;
      reasons.push(`RSI超卖信号 (${rsi.rsi})`);
      riskLevel = 'LOW';
    } else if (rsi.overbought) {
      rsiScore = -0.25;
      reasons.push(`RSI超买信号 (${rsi.rsi})`);
      riskLevel = 'HIGH';
    }

    // 成交量确认
    let volumeScore = 0;
    if (volume.isHighVolume) {
      volumeScore = 0.2;
      reasons.push(`成交量放大确认 (${volume.volumeRatio}x)`);
    } else if (volume.volumeRatio < 0.7) {
      volumeScore = -0.1;
      reasons.push(`成交量萎缩 (${volume.volumeRatio}x)`);
    }

    // SMA30趋势分析
    let trendScore = 0;
    const smaDeviation = (currentPrice - sma30) / sma30;
    
    if (smaDeviation > 0.02) {
      trendScore = 0.15;
      reasons.push(`强势上涨趋势 (+${(smaDeviation * 100).toFixed(1)}%)`);
    } else if (smaDeviation > 0) {
      trendScore = 0.05;
      reasons.push(`温和上涨趋势 (+${(smaDeviation * 100).toFixed(1)}%)`);
    } else if (smaDeviation < -0.02) {
      trendScore = -0.15;
      reasons.push(`强势下跌趋势 (${(smaDeviation * 100).toFixed(1)}%)`);
    } else if (smaDeviation < 0) {
      trendScore = -0.05;
      reasons.push(`温和下跌趋势 (${(smaDeviation * 100).toFixed(1)}%)`);
    }

    // 价格位置分析
    let positionScore = 0;
    if (priceRange.position < 0.2) {
      positionScore = 0.15;
      reasons.push(`价格接近区间底部 (${(priceRange.position * 100).toFixed(1)}%)`);
      riskLevel = 'LOW';
    } else if (priceRange.position > 0.8) {
      positionScore = -0.15;
      reasons.push(`价格接近区间顶部 (${(priceRange.position * 100).toFixed(1)}%)`);
      riskLevel = 'HIGH';
    }

    // 波动性调整
    const volatility = TechnicalIndicators.calculateVolatility(klines);
    let volatilityScore = 0;
    
    if (volatility > 0.3) {
      volatilityScore = -0.1;
      reasons.push(`高波动性市场 (${(volatility * 100).toFixed(1)}%)`);
      riskLevel = 'HIGH';
    } else if (volatility < 0.1) {
      volatilityScore = 0.05;
      reasons.push(`低波动性市场 (${(volatility * 100).toFixed(1)}%)`);
    }

    // 计算总分和信号
    const totalScore = kdjScore + rsiScore + volumeScore + trendScore + positionScore + volatilityScore;
    confidence = Math.min(Math.abs(totalScore), 1);

    // 信号决策逻辑
    if (totalScore > 0.5) {
      signal = 'BUY';
    } else if (totalScore < -0.5) {
      signal = 'SELL';
    } else {
      signal = 'HOLD';
      reasons.push('信号强度不足，建议观望');
    }

    // 最终验证：确保有足够的置信度
    if (confidence < this.config.confidenceThreshold) {
      signal = 'HOLD';
      reasons.push(`置信度不足 (${(confidence * 100).toFixed(1)}% < ${(this.config.confidenceThreshold * 100).toFixed(1)}%)`);
    }

    // 成交量验证：重要信号需要成交量确认
    if (signal !== 'HOLD' && !volume.isHighVolume && volume.volumeRatio < this.config.minVolumeRatio) {
      signal = 'HOLD';
      reasons.push(`缺乏成交量确认 (${volume.volumeRatio}x < ${this.config.minVolumeRatio}x)`);
    }

    // 生成操作建议
    const suggestedAction = this.generateActionSuggestion(signal, confidence, analysis);

    return {
      signal,
      confidence,
      reasons,
      analysis,
      riskLevel,
      suggestedAction
    };
  }

  /**
   * 生成操作建议
   */
  private generateActionSuggestion(
    signal: 'BUY' | 'SELL' | 'HOLD',
    confidence: number,
    analysis: TechnicalAnalysis
  ): string {
    const { priceRange, rsi, kdj } = analysis;

    switch (signal) {
      case 'BUY':
        if (confidence > 0.8) {
          return `强烈建议买入 - 多项指标共振，建议在$${priceRange.support.toFixed(4)}附近加仓`;
        } else if (confidence > 0.6) {
          return `建议买入 - 技术面偏多，可以分批建仓`;
        } else {
          return `谨慎买入 - 信号相对较弱，小仓位试探`;
        }

      case 'SELL':
        if (confidence > 0.8) {
          return `强烈建议卖出 - 多项指标看空，建议在$${priceRange.resistance.toFixed(4)}附近减仓`;
        } else if (confidence > 0.6) {
          return `建议卖出 - 技术面偏空，可以分批离场`;
        } else {
          return `谨慎卖出 - 信号相对较弱，减少仓位`;
        }

      case 'HOLD':
      default:
        if (rsi.oversold && kdj.k < 20) {
          return `观望等待 - 价格可能接近底部，等待更明确信号`;
        } else if (rsi.overbought && kdj.k > 80) {
          return `观望等待 - 价格可能接近顶部，等待回调机会`;
        } else {
          return `继续观望 - 市场方向不明确，等待趋势确立`;
        }
    }
  }

  /**
   * 获取缓存的分析结果
   */
  getCachedAnalysis(symbol: string): MarketAnalysisResult | null {
    return this.lastAnalysis.get(symbol) || null;
  }

  /**
   * 检查信号是否发生变化
   */
  hasSignalChanged(symbol: string, newSignal: 'BUY' | 'SELL' | 'HOLD'): boolean {
    const cached = this.lastAnalysis.get(symbol);
    return cached ? cached.signal !== newSignal : true;
  }

  /**
   * 获取市场概览
   */
  getMarketSummary(symbol: string): {
    trend: string;
    strength: string;
    risk: string;
    nextResistance: number;
    nextSupport: number;
  } | null {
    const cached = this.lastAnalysis.get(symbol);
    if (!cached) return null;

    const { analysis, riskLevel } = cached;
    const marketState = TechnicalIndicators.getMarketState(analysis);

    return {
      trend: marketState.trend,
      strength: marketState.strength,
      risk: riskLevel,
      nextResistance: analysis.priceRange.resistance,
      nextSupport: analysis.priceRange.support
    };
  }

  /**
   * 检查是否应该更新分析
   */
  shouldUpdateAnalysis(symbol: string): boolean {
    const cached = this.lastAnalysis.get(symbol);
    if (!cached) return true;

    // 超过5分钟的分析结果需要更新
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() - cached.analysis.timestamp > fiveMinutes;
  }

  /**
   * 清理过期的缓存
   */
  clearExpiredCache(): void {
    const now = Date.now();
    const expireTime = 15 * 60 * 1000; // 15分钟过期

    Array.from(this.lastAnalysis.entries()).forEach(([symbol, result]) => {
      if (now - result.analysis.timestamp > expireTime) {
        this.lastAnalysis.delete(symbol);
        console.log(`🧹 清理${symbol}的过期分析缓存`);
      }
    });
  }
}
