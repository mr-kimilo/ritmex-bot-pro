 import { TrendEngine, type TrendEngineSnapshot } from './trend-engine';
import { RedisKlineManager, type KlineManagerConfig } from '../utils/redis-kline-manager';
import { MarketAnalyzer, type MarketAnalyzerConfig, type MarketAnalysisResult } from '../utils/market-analyzer';
import type { TradingConfig } from '../config';
import type { ExchangeAdapter } from '../exchanges/adapter';
import {
  placeMarketOrder,
  unlockOperating,
  type OrderLockMap,
  type OrderTimerMap,
  type OrderPendingMap,
} from "./order-coordinator";
import { FeeMonitor } from "../utils/fee-monitor";

export interface EnhancedTrendEngineSnapshot extends TrendEngineSnapshot {
  // 增强模式的快照数据
  enhanced?: {
    enabled: boolean;
    lastAnalysis: MarketAnalysisResult | null;
    lastAnalysisTime: number | null;
    lastSignal: 'BUY' | 'SELL' | 'HOLD';
    signalChangedAt: number;
    confidenceThreshold: number;
    analysisInterval: number;
    minSignalInterval: number;
    feeProtection: any;
  };
  enhancedMode?: boolean;
}

/**
 * 增强版趋势引擎 - 使用技术分析代替SMA30进行交易决策
 * 不再是简单的组合模式，而是重写了核心交易逻辑
 */
export class EnhancedTrendEngine {
  private baseEngine: TrendEngine;
  private klineManager?: RedisKlineManager;
  private marketAnalyzer?: MarketAnalyzerConfig;
  private isEnhancedEnabled: boolean;
  private lastAnalysisTime = 0;
  private analysisInterval = 15000; // 15秒分析一次，更频繁
  private config: TradingConfig;
  private exchange: ExchangeAdapter;
  
  // 增强模式专用状态
  private lastMarketAnalysis: MarketAnalysisResult | null = null;
  private lastSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  private signalChangedAt = 0;
  private feeMonitor: FeeMonitor;
  private marketAnalyzerInstance?: MarketAnalyzer;
  
  // 交易控制
  private minSignalInterval = 30000; // 最小信号间隔30秒
  private confidenceThreshold = 0.7; // 默认置信度阈值

  constructor(
    config: TradingConfig,
    exchange: ExchangeAdapter,
    klineConfig?: KlineManagerConfig,
    analyzerConfig?: MarketAnalyzerConfig,
    enableEnhanced: boolean = false
  ) {
    this.config = config;
    this.exchange = exchange;
    this.baseEngine = new TrendEngine(config, exchange);
    this.isEnhancedEnabled = enableEnhanced;
    this.feeMonitor = new FeeMonitor({
      feeRate: config.feeRate,
      maxDailyFeePct: config.maxDailyFeePct,
      maxHourlyFeePct: config.maxHourlyFeePct,
      feeWarningThreshold: config.feeWarningThreshold,
      enableFeeProtection: config.enableFeeProtection,
      logInterval: config.logFeeSummaryInterval
    });
    
    if (enableEnhanced && klineConfig && analyzerConfig) {
      this.klineManager = new RedisKlineManager(klineConfig);
      this.marketAnalyzer = analyzerConfig;
      this.confidenceThreshold = analyzerConfig.confidenceThreshold;
      this.initializeEnhancedAnalysis();
    }
  }

  /**
   * 初始化增强分析功能
   */
  private async initializeEnhancedAnalysis(): Promise<void> {
    if (!this.isEnhancedEnabled || !this.klineManager || !this.marketAnalyzer) return;

    try {
      console.log('🔗 连接Redis进行K线数据管理...');
      await this.klineManager.connect();
      
      this.marketAnalyzerInstance = new MarketAnalyzer(this.klineManager, this.marketAnalyzer);
      
      console.log('📊 增强技术分析系统已启动');
      console.log(`✨ 使用技术分析替代SMA30进行交易决策`);
      console.log(`📋 置信度阈值: ${(this.confidenceThreshold * 100).toFixed(1)}%`);
      
      // 定期清理过期缓存
      setInterval(() => {
        this.marketAnalyzerInstance?.clearExpiredCache();
      }, 10 * 60 * 1000); // 10分钟清理一次
      
    } catch (error) {
      console.error('❌ 初始化增强分析失败:', error);
      // 继续使用基础模式
      this.isEnhancedEnabled = false;
    }
  }

  /**
   * 启动引擎，包含增强分析
   */
  start(): void {
    if (this.isEnhancedEnabled) {
      console.log('🚀 启动增强趋势引擎 - 技术分析模式');
      
      // 启动基础引擎但禁用其交易决策
      this.baseEngine.start();
      
      // 启动增强分析定时器
      setInterval(() => {
        this.performEnhancedTradingDecision().catch(error => {
          console.error('❌ 增强交易决策失败:', error);
        });
      }, this.analysisInterval);
      
      // 立即执行一次分析
      setTimeout(() => {
        this.performEnhancedTradingDecision().catch(console.error);
      }, 5000);
      
    } else {
      console.log('🚀 启动基础趋势引擎 - SMA30模式');
      this.baseEngine.start();
    }
  }

  /**
   * 执行增强交易决策 - 核心交易逻辑
   */
  private async performEnhancedTradingDecision(): Promise<void> {
    if (!this.isEnhancedEnabled || !this.klineManager?.isReady() || !this.marketAnalyzerInstance) {
      return;
    }

    try {
      // 执行市场分析
      const analysis = await this.marketAnalyzerInstance.analyze(
        this.exchange, 
        this.config.symbol
      );

      if (!analysis) {
        console.warn('⚠️ 技术分析数据不足，跳过交易决策');
        return;
      }

      this.lastMarketAnalysis = analysis;
      this.lastAnalysisTime = Date.now();

      // 检查信号变化
      const newSignal = analysis.signal;
      const signalChanged = newSignal !== this.lastSignal;
      
      if (signalChanged) {
        this.lastSignal = newSignal;
        this.signalChangedAt = Date.now();
        console.log(`🔄 信号变化: ${newSignal} (置信度: ${(analysis.confidence * 100).toFixed(1)}%)`);
      }

      // 执行交易决策
      await this.executeEnhancedTradingDecision(analysis, signalChanged);

    } catch (error) {
      console.error('❌ 增强交易决策执行失败:', error);
    }
  }

  /**
   * 执行增强交易决策
   */
  private async executeEnhancedTradingDecision(
    analysis: MarketAnalysisResult, 
    signalChanged: boolean
  ): Promise<void> {
    const baseSnapshot = this.baseEngine.getSnapshot();
    const hasPosition = Math.abs(baseSnapshot.position.positionAmt) > 1e-8;
    const isLong = baseSnapshot.position.positionAmt > 0;
    const isShort = baseSnapshot.position.positionAmt < 0;
    
    // 检查手续费保护
    if (this.feeMonitor.shouldStopTrading()) {
      console.log('🚨 手续费保护激活，跳过交易决策');
      return;
    }

    // 检查最小信号间隔
    const timeSinceLastSignal = Date.now() - this.signalChangedAt;
    if (!signalChanged && timeSinceLastSignal < this.minSignalInterval) {
      return; // 信号未变化且间隔太短，跳过
    }

    // 检查置信度
    if (analysis.confidence < this.confidenceThreshold) {
      console.log(`📊 置信度不足 ${(analysis.confidence * 100).toFixed(1)}% < ${(this.confidenceThreshold * 100).toFixed(1)}%，保持观望`);
      return;
    }

    // 检查风险等级
    if (analysis.riskLevel === 'HIGH') {
      console.log(`⚠️ 高风险环境，暂停交易`);
      return;
    }

    const currentPrice = baseSnapshot.lastPrice;
    if (!currentPrice) return;

    // 开仓决策
    if (!hasPosition) {
      await this.handleEnhancedOpenPosition(analysis, currentPrice);
    } 
    // 平仓决策
    else {
      await this.handleEnhancedClosePosition(analysis, currentPrice, isLong, isShort);
    }
  }

  /**
   * 处理增强开仓决策
   */
  private async handleEnhancedOpenPosition(
    analysis: MarketAnalysisResult,
    currentPrice: number
  ): Promise<void> {
    const { signal, confidence, reasons, riskLevel } = analysis;
    
    if (signal === 'HOLD') {
      return; // 观望信号，不开仓
    }

    // 额外的开仓条件检查
    const technicalIndicators = analysis.analysis;
    
    // BUY信号检查
    if (signal === 'BUY') {
      const reasons_str = reasons.join('; ');
      console.log(`📈 开多信号 (${(confidence * 100).toFixed(1)}%): ${reasons_str}`);
      
      // 执行开多
      await this.submitEnhancedMarketOrder(
        'BUY', 
        currentPrice, 
        `技术分析开多 - ${reasons_str}`,
        confidence
      );
      
    }
    // SELL信号检查  
    else if (signal === 'SELL') {
      const reasons_str = reasons.join('; ');
      console.log(`📉 开空信号 (${(confidence * 100).toFixed(1)}%): ${reasons_str}`);
      
      // 执行开空
      await this.submitEnhancedMarketOrder(
        'SELL', 
        currentPrice, 
        `技术分析开空 - ${reasons_str}`,
        confidence
      );
    }
  }

  /**
   * 处理增强平仓决策
   */
  private async handleEnhancedClosePosition(
    analysis: MarketAnalysisResult,
    currentPrice: number,
    isLong: boolean,
    isShort: boolean
  ): Promise<void> {
    const { signal, confidence, reasons } = analysis;
    
    // 强制平仓条件：反向信号且高置信度
    const shouldForceClose = (
      (isLong && signal === 'SELL' && confidence > 0.8) ||
      (isShort && signal === 'BUY' && confidence > 0.8)
    );

    if (shouldForceClose) {
      const direction = isLong ? '多头' : '空头';
      const closeReason = `技术分析强制平${direction} - ${reasons.join('; ')}`;
      
      console.log(`⚠️ 强制平仓信号 (${(confidence * 100).toFixed(1)}%): ${closeReason}`);
      
      await this.submitEnhancedMarketOrder(
        isLong ? 'SELL' : 'BUY',
        currentPrice,
        closeReason,
        confidence
      );
    }
  }

  /**
   * 提交增强市场订单
   */
  private async submitEnhancedMarketOrder(
    side: "BUY" | "SELL", 
    price: number, 
    reason: string,
    confidence: number
  ): Promise<void> {
    try {
      console.log(`🎯 提交订单: ${side} @ $${price.toFixed(4)} - ${reason}`);
      
      // 记录手续费
      this.feeMonitor.recordTrade({
        symbol: this.config.symbol,
        side,
        quantity: this.config.positionSize,
        price,
        orderId: `enhanced_${Date.now()}`
      });

      // 使用基础引擎的订单提交逻辑
      const locks = (this.baseEngine as any).locks as OrderLockMap;
      const timers = (this.baseEngine as any).timers as OrderTimerMap;
      const pending = (this.baseEngine as any).pending as OrderPendingMap;

      await placeMarketOrder(
        this.exchange,
        locks,
        timers,
        pending,
        this.config.symbol,
        side,
        this.config.positionSize,
        (this.baseEngine as any).tradeLog,
        reason
      );

      console.log(`✅ 增强趋势订单已提交: ${side} ${this.config.positionSize} @ $${price.toFixed(4)}`);
      
    } catch (error) {
      console.error(`❌ 增强趋势订单提交失败:`, error);
    }
  }

  /**
   * 获取快照，包含增强数据
   */
  getSnapshot(): EnhancedTrendEngineSnapshot {
    const baseSnapshot = this.baseEngine.getSnapshot();
    
    if (!this.isEnhancedEnabled) {
      return baseSnapshot as EnhancedTrendEngineSnapshot;
    }

    // 增强快照数据
    return {
      ...baseSnapshot,
      enhanced: {
        enabled: this.isEnhancedEnabled,
        lastAnalysis: this.lastMarketAnalysis,
        lastAnalysisTime: this.lastAnalysisTime,
        lastSignal: this.lastSignal,
        signalChangedAt: this.signalChangedAt,
        confidenceThreshold: this.confidenceThreshold,
        analysisInterval: this.analysisInterval,
        minSignalInterval: this.minSignalInterval,
        feeProtection: this.feeMonitor.getFeeStats()
      },
      enhancedMode: true
    } as EnhancedTrendEngineSnapshot;
  }

  /**
   * 停止引擎，清理资源
   */
  stop(): void {
    console.log('🛑 停止增强趋势引擎...');
    
    // 停止基础引擎
    this.baseEngine.stop();
    
    // 清理增强功能资源
    if (this.isEnhancedEnabled && this.klineManager) {
      this.klineManager.disconnect().catch(console.error);
    }
  }

  /**
   * 监听器代理
   */
  on(event: "update", handler: (snapshot: EnhancedTrendEngineSnapshot) => void): void {
    this.baseEngine.on(event, () => {
      const enhancedSnapshot = this.getSnapshot();
      handler(enhancedSnapshot);
    });
  }

  /**
   * 移除监听器代理
   */
  off(event: "update", handler: (snapshot: EnhancedTrendEngineSnapshot) => void): void {
    // 注意：这里无法完美代理off方法，因为原始handler被包装了
    console.warn('Enhanced trend engine off() method has limitations');
  }

  /**
   * 获取增强分析状态
   */
  getEnhancedStatus(): {
    enabled: boolean;
    connected: boolean;
    lastAnalysis: MarketAnalysisResult | null;
    lastAnalysisTime: number | null;
    lastSignal: string;
    confidenceThreshold: number;
    feeProtection: any;
  } {
    return {
      enabled: this.isEnhancedEnabled,
      connected: this.klineManager?.isReady() || false,
      lastAnalysis: this.lastMarketAnalysis,
      lastAnalysisTime: this.lastAnalysisTime,
      lastSignal: this.lastSignal,
      confidenceThreshold: this.confidenceThreshold,
      feeProtection: this.feeMonitor.getFeeStats()
    };
  }

  /**
   * 手动触发技术分析
   */
  async triggerAnalysis(): Promise<MarketAnalysisResult | null> {
    if (!this.isEnhancedEnabled || !this.marketAnalyzerInstance) {
      console.warn('⚠️ 增强功能未启用或未初始化');
      return null;
    }

    try {
      const analysis = await this.marketAnalyzerInstance.analyze(
        this.exchange, 
        this.config.symbol
      );
      
      if (analysis) {
        this.lastMarketAnalysis = analysis;
        this.lastAnalysisTime = Date.now();
        console.log(`� 手动分析完成: ${analysis.signal} (${(analysis.confidence * 100).toFixed(1)}%)`);
      }
      
      return analysis;
      
    } catch (error) {
      console.error('❌ 手动触发分析失败:', error);
      return null;
    }
  }

  /**
   * 更新置信度阈值
   */
  setConfidenceThreshold(threshold: number): void {
    if (threshold >= 0.5 && threshold <= 1.0) {
      this.confidenceThreshold = threshold;
      console.log(`📋 置信度阈值已更新: ${(threshold * 100).toFixed(1)}%`);
    } else {
      console.warn('⚠️ 置信度阈值必须在 50%-100% 之间');
    }
  }

  /**
   * 获取最近的市场分析结果
   */
  getLastAnalysis(): MarketAnalysisResult | null {
    return this.lastMarketAnalysis;
  }

  /**
   * 检查是否应该暂停交易
   */
  private shouldPauseTrading(): boolean {
    // 手续费保护检查
    if (this.feeMonitor.shouldStopTrading()) {
      return true;
    }

    // 最近分析数据过期检查
    if (this.lastAnalysisTime) {
      const timeSinceLastAnalysis = Date.now() - this.lastAnalysisTime;
      if (timeSinceLastAnalysis > this.analysisInterval * 3) {
        console.warn('⚠️ 分析数据过期，暂停交易决策');
        return true;
      }
    }

    return false;
  }

  /**
   * 获取技术分析建议
   */
  getAnalysisRecommendation(): {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasons: string[];
    shouldOpenPosition: boolean;
    shouldClosePosition: boolean;
  } | null {
    if (!this.isEnhancedEnabled || !this.lastMarketAnalysis) return null;
    
    const analysis = this.lastMarketAnalysis;
    const baseSnapshot = this.baseEngine.getSnapshot();
    const hasPosition = Math.abs(baseSnapshot.position.positionAmt) > 1e-8;
    const isLong = baseSnapshot.position.positionAmt > 0;
    const isShort = baseSnapshot.position.positionAmt < 0;
    
    return {
      signal: analysis.signal,
      confidence: analysis.confidence,
      reasons: analysis.reasons,
      shouldOpenPosition: !hasPosition && analysis.confidence >= this.confidenceThreshold && analysis.riskLevel !== 'HIGH',
      shouldClosePosition: hasPosition && (
        (isLong && analysis.signal === "SELL" && analysis.confidence > 0.8) ||
        (isShort && analysis.signal === "BUY" && analysis.confidence > 0.8)
      )
    };
  }

  /**
   * 检查是否应该启用增强模式
   */
  isEnhancedModeEnabled(): boolean {
    return this.isEnhancedEnabled;
  }

  /**
   * 获取Redis连接状态
   */
  getRedisStatus(): boolean {
    return this.klineManager?.isReady() || false;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.isEnhancedEnabled && this.klineManager) {
      await this.klineManager.disconnect();
      console.log('📴 Redis K线管理器已断开');
    }
  }

  /**
   * 获取市场概览
   */
  getMarketSummary(): any {
    if (!this.isEnhancedEnabled || !this.lastMarketAnalysis) return null;
    
    return {
      symbol: this.config.symbol,
      lastAnalysis: this.lastMarketAnalysis,
      lastAnalysisTime: this.lastAnalysisTime,
      lastSignal: this.lastSignal,
      signalChangedAt: this.signalChangedAt,
      confidenceThreshold: this.confidenceThreshold,
      feeProtection: this.feeMonitor.getFeeStats()
    };
  }

  /**
   * 强制刷新分析
   */
  async forceRefreshAnalysis(): Promise<void> {
    if (!this.isEnhancedEnabled) return;
    
    this.lastAnalysisTime = 0; // 重置时间，强制下次更新
    await this.performEnhancedTradingDecision();
  }
}
