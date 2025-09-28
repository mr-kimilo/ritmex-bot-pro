import type { TradingConfig } from "../config";
import type { ExchangeAdapter } from "../exchanges/adapter";
import type {
  AsterAccountSnapshot,
  AsterOrder,
  AsterTicker,
  AsterDepth,
  AsterKline,
} from "../exchanges/types";
import {
  calcStopLossPrice,
  calcTrailingActivationPrice,
  getPosition,
  getSMA,
  shouldStopLossByPercentage,
  shouldTakeProfitByPercentage,
  type PositionSnapshot,
} from "../utils/strategy";
import { computePositionPnl } from "../utils/pnl";
import { getMidOrLast } from "../utils/price";
import {
  marketClose,
  placeMarketOrder,
  placeStopLossOrder,
  placeTrailingStopOrder,
  unlockOperating,
} from "./order-coordinator";
import type { OrderLockMap, OrderPendingMap, OrderTimerMap } from "./order-coordinator";
import { isUnknownOrderError } from "../utils/errors";
import { roundDownToTick } from "../utils/math";
import { createTradeLog, type TradeLogEntry } from "../state/trade-log";
import { FeeMonitor, type FeeStats } from "../utils/fee-monitor";
import { logger } from "../utils/logger";
import { DynamicRiskManager, createDefaultDynamicRiskConfig, type DynamicRiskParams } from "../utils/dynamic-risk";
import { GreedyTakeProfitManager, type GreedyProfitConfig } from "../utils/greedy-take-profit";

export interface TrendEngineSnapshot {
  ready: boolean;
  symbol: string;
  lastPrice: number | null;
  sma30: number | null;
  trend: "做多" | "做空" | "无信号";
  position: PositionSnapshot;
  pnl: number;
  unrealized: number;
  totalProfit: number;
  totalTrades: number;
  sessionVolume: number;
  tradeLog: TradeLogEntry[];
  openOrders: AsterOrder[];
  depth: AsterDepth | null;
  ticker: AsterTicker | null;
  lastUpdated: number | null;
  lastOpenSignal: OpenOrderPlan;
  feeStats: FeeStats;  // 手续费统计
  // 当前实际使用的风险参数（动态或静态）
  currentRiskParams: {
    lossLimit: number;
    trailingProfit: number;
    profitLockTrigger: number;
    profitLockOffset: number;
    isDynamic: boolean;  // 标识是否使用动态参数
  };
  // 贪婪止盈状态
  greedyTakeProfit: {
    isActive: boolean;
    timeElapsed?: number;
    priceCount?: number;
    currentProfit?: number;
    extraProfitTarget?: number;
    bestPrice?: number;
  };
}

export interface OpenOrderPlan {
  side: "BUY" | "SELL" | null;
  price: number | null;
}

type TrendEngineEvent = "update";

type TrendEngineListener = (snapshot: TrendEngineSnapshot) => void;

export class TrendEngine {
  private accountSnapshot: AsterAccountSnapshot | null = null;
  private openOrders: AsterOrder[] = [];
  private depthSnapshot: AsterDepth | null = null;
  private tickerSnapshot: AsterTicker | null = null;
  private klineSnapshot: AsterKline[] = [];

  private readonly locks: OrderLockMap = {};
  private readonly timers: OrderTimerMap = {};
  private readonly pending: OrderPendingMap = {};

  private readonly tradeLog: ReturnType<typeof createTradeLog>;
  private readonly feeMonitor: FeeMonitor;
  private readonly dynamicRiskManager: DynamicRiskManager | null = null;
  private readonly greedyTakeProfitManager!: GreedyTakeProfitManager;

  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private lastPrice: number | null = null;
  private lastSma30: number | null = null;
  private lastRiskUpdatePrice: number | null = null;  // 最后更新风险参数时的价格
  
  // 高频交易控制
  private lastPositionOpenTime: number = 0;      // 最后开仓时间
  private lastPositionCloseTime: number = 0;     // 最后平仓时间
  
  // 动态风险参数（优先使用这些值，如果为null则使用config中的默认值）
  private dynamicLossLimit: number | null = null;
  private dynamicTrailingProfit: number | null = null;
  private dynamicProfitLockTrigger: number | null = null;
  private dynamicProfitLockOffset: number | null = null;
  private lastPositionAmount = 0;
  private lastPositionEntryPrice = 0;
  private wasPositionOpen = false;

  private async detectManualPositionClose(position: PositionSnapshot, currentPrice: number): Promise<void> {
    const hasPosition = Math.abs(position.positionAmt) > 1e-5;
    const hadPosition = this.wasPositionOpen;
    
    // 如果之前有仓位，现在没有了，说明仓位被平掉了
    if (hadPosition && !hasPosition) {
      // 计算平仓盈亏
      const direction = this.lastPositionAmount > 0 ? "long" : "short";
      const pnl = (direction === "long" 
        ? currentPrice - this.lastPositionEntryPrice 
        : this.lastPositionEntryPrice - currentPrice) * Math.abs(this.lastPositionAmount);
      
      // 更新统计数据
      this.totalTrades += 1;
      this.totalProfit += pnl;
      
      // 记录手动平仓的手续费
      const closeSide = direction === "long" ? "SELL" : "BUY";
      this.feeMonitor.recordTrade({
        symbol: this.config.symbol,
        side: closeSide,
        quantity: Math.abs(this.lastPositionAmount),
        price: currentPrice,
        orderId: `manual_close_${Date.now()}`
      });
      
      // 计算并记录手续费信息
      const tradeValue = Math.abs(this.lastPositionAmount) * currentPrice;
      const feeAmount = tradeValue * this.config.feeRate;
      const feeSummary = this.feeMonitor.getFeeSummary();
      this.tradeLog.push("info", `💰 手动平仓手续费: $${feeAmount.toFixed(6)} USDT (日累计: $${feeSummary.dailyFee.toFixed(6)} USDT)`);
      
      // 记录到日志文件
      logger.writeTrade(`手动平仓: ${direction === "long" ? "多头" : "空头"} ${Math.abs(this.lastPositionAmount)} @ $${currentPrice.toFixed(4)}, 手续费: $${feeAmount.toFixed(6)}`);
      logger.writeTrade(`平仓${pnl > 0 ? "盈利" : "亏损"}: $${Math.abs(pnl).toFixed(4)} USDT`);
      
      // 记录手动平仓事件
      const pnlText = pnl > 0 ? `盈利 $${pnl.toFixed(4)}` : `亏损 $${Math.abs(pnl).toFixed(4)}`;
      this.tradeLog.push("close", 
        `🔄 检测到手动平仓: ${direction === "long" ? "多头" : "空头"} ${Math.abs(this.lastPositionAmount)} @ $${currentPrice.toFixed(4)}`
      );
      this.tradeLog.push("info", `📊 平仓${pnl > 0 ? "盈利" : "亏损"}: $${Math.abs(pnl).toFixed(4)} USDT`);
      
      // 重置贪婪止盈管理器状态
      this.greedyTakeProfitManager.forceExit();
      
      // 更新最后平仓时间
      this.lastPositionCloseTime = Date.now();
    }
    
    // 更新仓位状态追踪
    this.wasPositionOpen = hasPosition;
    if (hasPosition) {
      // 检测手动开仓：如果之前没有仓位，现在有了
      if (!hadPosition && hasPosition) {
        const direction = position.positionAmt > 0 ? "long" : "short";
        const openSide = direction === "long" ? "BUY" : "SELL";
        
        // 记录手动开仓的手续费
        this.feeMonitor.recordTrade({
          symbol: this.config.symbol,
          side: openSide,
          quantity: Math.abs(position.positionAmt),
          price: position.entryPrice,
          orderId: `manual_open_${Date.now()}`
        });
        
        // 计算并记录手续费信息
        const tradeValue = Math.abs(position.positionAmt) * position.entryPrice;
        const feeAmount = tradeValue * this.config.feeRate;
        const feeSummary = this.feeMonitor.getFeeSummary();
        this.tradeLog.push("info", `💰 手动开仓手续费: $${feeAmount.toFixed(6)} USDT (日累计: $${feeSummary.dailyFee.toFixed(6)} USDT)`);
        this.tradeLog.push("open", `🔄 检测到手动开仓: ${direction === "long" ? "多头" : "空头"} ${Math.abs(position.positionAmt)} @ $${position.entryPrice.toFixed(4)}`);
        
        // 记录到日志文件
        logger.writeTrade(`手动开仓: ${direction === "long" ? "多头" : "空头"} ${Math.abs(position.positionAmt)} @ $${position.entryPrice.toFixed(4)}, 手续费: $${feeAmount.toFixed(6)}`);
      }
      
      this.lastPositionAmount = position.positionAmt;
      this.lastPositionEntryPrice = position.entryPrice;
    }
  }

  private totalProfit = 0;
  private totalTrades = 0;
  private lastOpenPlan: OpenOrderPlan = { side: null, price: null };
  private sessionQuoteVolume = 0;
  private prevPositionAmt = 0;
  private initializedPosition = false;
  private cancelAllRequested = false;
  private readonly pendingCancelOrders = new Set<number>();

  private ordersSnapshotReady = false;
  private startupLogged = false;
  private entryPricePendingLogged = false;

  private readonly listeners = new Map<TrendEngineEvent, Set<TrendEngineListener>>();

  constructor(private readonly config: TradingConfig, private readonly exchange: ExchangeAdapter) {
    this.tradeLog = createTradeLog(this.config.maxLogEntries);
    this.feeMonitor = new FeeMonitor({
      feeRate: this.config.feeRate,
      maxDailyFeePct: this.config.maxDailyFeePct,
      maxHourlyFeePct: this.config.maxHourlyFeePct,
      feeWarningThreshold: this.config.feeWarningThreshold,
      enableFeeProtection: this.config.enableFeeProtection,
      logInterval: this.config.logFeeSummaryInterval
    });
    
    // 初始化动态风险管理器
    if (this.config.enableDynamicRisk) {
      const dynamicConfig = createDefaultDynamicRiskConfig(this.config.symbol, this.config.tradeAmount);
      dynamicConfig.riskPercentage = this.config.riskPercentage;
      dynamicConfig.profitTarget = this.config.profitTargetPercentage;
      dynamicConfig.recalcThreshold = this.config.dynamicRiskThreshold;
      
      // 从环境变量读取高频交易参数
      dynamicConfig.minHoldTimeMs = parseInt(process.env.MIN_POSITION_HOLD_TIME_MS || '1000');
      dynamicConfig.maxPositionMultiplier = parseFloat(process.env.MAX_POSITION_SIZE_MULTIPLIER || '1.2');
      dynamicConfig.trailingCallback = parseFloat(process.env.TRAILING_PROFIT_PERCENTAGE || '0.008');
      dynamicConfig.protectionOffset = parseFloat(process.env.PROFIT_LOCK_OFFSET_PERCENTAGE || '0.006');
      dynamicConfig.profitLockRatio = parseFloat(process.env.PROFIT_LOCK_TRIGGER_PERCENTAGE || '0.015') / dynamicConfig.profitTarget;
      
      (this as any).dynamicRiskManager = new DynamicRiskManager(dynamicConfig);
      this.tradeLog.push("info", `🎯 动态风险管理已启用 - 高频模式 (阈值: ${(dynamicConfig.recalcThreshold*100).toFixed(1)}%)`);
    } else {
      (this as any).dynamicRiskManager = null;
      this.tradeLog.push("info", "📊 使用静态风险管理配置");
    }
    
    // 初始化贪婪止盈管理器
    const greedyConfig: GreedyProfitConfig = {
      enabled: process.env.ENABLE_GREEDY_TAKE_PROFIT === 'true',
      sampleSize: parseInt(process.env.GREEDY_SAMPLE_SIZE || '10'),
      reversalThreshold: parseFloat(process.env.GREEDY_REVERSAL_THRESHOLD || '0.002'),
      maxWaitTime: parseInt(process.env.GREEDY_MAX_WAIT_TIME_MS || '30000'),
      extraProfitTarget: parseFloat(process.env.GREEDY_EXTRA_PROFIT_TARGET || '0.005')
    };
    
    (this as any).greedyTakeProfitManager = new GreedyTakeProfitManager(greedyConfig);
    
    if (greedyConfig.enabled) {
      this.tradeLog.push("info", `🎯 贪婪止盈已启用 - 采样数: ${greedyConfig.sampleSize}, 反转阈值: ${(greedyConfig.reversalThreshold*100).toFixed(2)}%, 额外目标: ${(greedyConfig.extraProfitTarget*100).toFixed(2)}%`);
    } else {
      this.tradeLog.push("info", "📊 使用标准止盈策略");
    }
    
    this.bootstrap();
  }

  /**
   * 检查是否可以下新订单（基于最小持仓时间）
   */
  private canPlaceNewOrder(): boolean {
    const now = Date.now();
    const manager = (this as any).dynamicRiskManager as DynamicRiskManager | null;
    
    if (!manager) return true;  // 没有动态风险管理时不限制
    
    // 获取当前价格来计算参数
    const currentPrice = this.lastPrice || parseFloat(process.env.ASTERUSDT_FALLBACK_PRICE || '1.88');
    const params = manager.calculateRiskParams(currentPrice);
    
    // 检查最小持仓时间
    const timeSinceLastOpen = now - this.lastPositionOpenTime;
    const timeSinceLastClose = now - this.lastPositionCloseTime;
    
    return timeSinceLastOpen >= params.minHoldTimeMs && timeSinceLastClose >= params.minHoldTimeMs;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  on(event: TrendEngineEvent, handler: TrendEngineListener): void {
    const handlers = this.listeners.get(event) ?? new Set<TrendEngineListener>();
    handlers.add(handler);
    this.listeners.set(event, handlers);
  }

  off(event: TrendEngineEvent, handler: TrendEngineListener): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.listeners.delete(event);
    }
  }

  getSnapshot(): TrendEngineSnapshot {
    return this.buildSnapshot();
  }

  private bootstrap(): void {
    try {
      // 记录系统启动
      logger.writeSystem("开始订阅账户数据流...");
      
      this.exchange.watchAccount((snapshot) => {
        try {
          // 记录持仓变化
          const previousPosition = this.accountSnapshot ? getPosition(this.accountSnapshot, this.config.symbol) : null;
          this.accountSnapshot = snapshot;
          const currentPosition = getPosition(snapshot, this.config.symbol);
          
          // 检查持仓变化并记录
          if (previousPosition && currentPosition) {
            const prevAmount = previousPosition.positionAmt;
            const currAmount = currentPosition.positionAmt;
            const prevEntry = previousPosition.entryPrice;
            const currEntry = currentPosition.entryPrice;
            
            // 检查持仓量变化
            if (Math.abs(prevAmount - currAmount) > 0.0001) {
              if (prevAmount === 0 && currAmount !== 0) {
                // 新开仓
                const direction = currAmount > 0 ? "多头" : "空头";
                this.tradeLog.push("position", `📊 ${direction}持仓已建立: ${Math.abs(currAmount)} ${this.config.symbol} @ $${currEntry.toFixed(4)}`);
                this.tradeLog.push("info", `💼 账户余额: $${Number(snapshot.totalWalletBalance || 0).toFixed(2)} USDT`);
              } else if (prevAmount !== 0 && currAmount === 0) {
                // 平仓
                this.tradeLog.push("position", `✅ 持仓已平仓: 原持仓 ${Math.abs(prevAmount)} ${this.config.symbol}`);
                this.tradeLog.push("info", `💼 账户余额: $${Number(snapshot.totalWalletBalance || 0).toFixed(2)} USDT`);
              } else {
                // 持仓量变化
                const change = currAmount - prevAmount;
                const action = change > 0 ? "增加" : "减少";
                this.tradeLog.push("position", `🔄 持仓${action}: ${Math.abs(change)} ${this.config.symbol} (当前: ${Math.abs(currAmount)})`);
              }
            }
          }
          
          this.updateSessionVolume(currentPosition);
          
          // 更新账户余额到手续费监控器
          if (snapshot && snapshot.totalWalletBalance) {
            const previousBalance = this.feeMonitor ? (this.feeMonitor as any).totalBalance : 0;
            const currentBalance = Number(snapshot.totalWalletBalance);
            this.feeMonitor.updateBalance(currentBalance);
            
            // 记录余额变化（如果变化超过0.01 USDT）
            if (previousBalance > 0 && Math.abs(currentBalance - previousBalance) > 0.01) {
              const change = currentBalance - previousBalance;
              const changePercent = ((change / previousBalance) * 100);
              const direction = change > 0 ? "增加" : "减少";
              this.tradeLog.push("info", `💰 账户余额${direction}: $${Math.abs(change).toFixed(4)} USDT (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%) -> $${currentBalance.toFixed(2)} USDT`);
            }
          }
          
          this.emitUpdate();
        } catch (err) {
          this.tradeLog.push("error", `账户推送处理异常: ${String(err)}`);
        }
      });
    } catch (err) {
      this.tradeLog.push("error", `订阅账户失败: ${String(err)}`);
    }
    try {
      this.exchange.watchOrders((orders) => {
        try {
          this.synchronizeLocks(orders);
          
          // 检查订单状态变化并记录手续费
          if (Array.isArray(orders)) {
            // 只在调试模式下显示订单概览，避免频繁输出
            if (process.env.DEBUG_TRADE_RECORDING === 'true') {
              const filledOrders = orders.filter(o => o.symbol === this.config.symbol && o.status === 'FILLED');
              if (filledOrders.length > 0) {
                console.log(`🔍 发现 ${filledOrders.length} 个已成交订单需要处理`);
              }
            }
            
            for (const order of orders) {
              if (order.symbol === this.config.symbol && order.status === 'FILLED' && order.executedQty && order.avgPrice) {
                // 只在实际处理成交订单时显示详细信息
                if (process.env.DEBUG_TRADE_RECORDING === 'true') {
                  console.log(`📊 处理成交订单: ${order.orderId} | ${order.side} ${order.executedQty} @ $${order.avgPrice}`);
                }
                
                // 记录成交信息到交易日志
                this.tradeLog.push("order", `✅ 订单成交: ${order.side} ${order.executedQty} @ $${Number(order.avgPrice).toFixed(4)}`);
                
                // 记录手续费
                const feeResult = this.feeMonitor.recordTrade({
                  symbol: order.symbol,
                  side: order.side as 'BUY' | 'SELL',
                  quantity: Number(order.executedQty),
                  price: Number(order.avgPrice),
                  orderId: String(order.orderId)
                });
                
                // 计算并记录手续费信息
                const tradeValue = Number(order.executedQty) * Number(order.avgPrice);
                const feeAmount = tradeValue * 0.0004; // ASTER手续费率0.04%
                const feeSummary = this.feeMonitor.getFeeSummary();
                this.tradeLog.push("info", `💰 交易手续费: $${feeAmount.toFixed(6)} USDT (日累计: $${feeSummary.dailyFee.toFixed(6)} USDT)`);
                
                // 记录到日志文件
                logger.writeTrade(`订单成交: ${order.side} ${order.executedQty} @ $${Number(order.avgPrice).toFixed(4)}, 手续费: $${feeAmount.toFixed(6)}`);
                
                // 立即增加交易计数（不等到仓位关闭）
                // 注释：这里不增加totalTrades，因为应该在仓位完全关闭时才算一笔完整交易
                // this.totalTrades += 1;
                // console.log(`📊 记录交易: 总交易数现在为 ${this.totalTrades}`);
                
                if (feeResult.shouldStop) {
                  this.tradeLog.push("warning", `🚨 手续费保护触发: ${feeResult.reason}`);
                }
              }
            }
          }
          
          this.openOrders = Array.isArray(orders)
            ? orders.filter((order) => order.type !== "MARKET" && order.symbol === this.config.symbol)
            : [];
          const currentIds = new Set(this.openOrders.map((order) => order.orderId));
          for (const id of Array.from(this.pendingCancelOrders)) {
            if (!currentIds.has(id)) {
              this.pendingCancelOrders.delete(id);
            }
          }
          if (this.openOrders.length === 0 || this.pendingCancelOrders.size === 0) {
            this.cancelAllRequested = false;
          }
          this.ordersSnapshotReady = true;
          this.emitUpdate();
        } catch (err) {
          this.tradeLog.push("error", `订单推送处理异常: ${String(err)}`);
        }
      });
    } catch (err) {
      this.tradeLog.push("error", `订阅订单失败: ${String(err)}`);
    }
    try {
      this.exchange.watchDepth(this.config.symbol, (depth) => {
        try {
          this.depthSnapshot = depth;
          this.emitUpdate();
        } catch (err) {
          this.tradeLog.push("error", `深度推送处理异常: ${String(err)}`);
        }
      });
    } catch (err) {
      this.tradeLog.push("error", `订阅深度失败: ${String(err)}`);
    }
    try {
      this.exchange.watchTicker(this.config.symbol, (ticker) => {
        try {
          this.tickerSnapshot = ticker;
          this.emitUpdate();
        } catch (err) {
          this.tradeLog.push("error", `价格推送处理异常: ${String(err)}`);
        }
      });
    } catch (err) {
      this.tradeLog.push("error", `订阅Ticker失败: ${String(err)}`);
    }
    try {
      this.exchange.watchKlines(this.config.symbol, this.config.klineInterval, (klines) => {
        try {
          this.klineSnapshot = Array.isArray(klines) ? klines : [];
          this.emitUpdate();
        } catch (err) {
          this.tradeLog.push("error", `K线推送处理异常: ${String(err)}`);
        }
      });
    } catch (err) {
      this.tradeLog.push("error", `订阅K线失败: ${String(err)}`);
    }
  }

  private synchronizeLocks(orders: AsterOrder[] | null | undefined): void {
    const list = Array.isArray(orders) ? orders : [];
    Object.keys(this.pending).forEach((type) => {
      const pendingId = this.pending[type];
      if (!pendingId) return;
      const match = list.find((order) => String(order.orderId) === pendingId);
      if (!match || (match.status && match.status !== "NEW")) {
        unlockOperating(this.locks, this.timers, this.pending, type);
      }
    });
  }

  private isReady(): boolean {
    return Boolean(
      this.accountSnapshot &&
        this.tickerSnapshot &&
        this.depthSnapshot &&
        this.klineSnapshot.length >= 30
    );
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      if (!this.ordersSnapshotReady) {
        this.emitUpdate();
        return;
      }
      if (!this.isReady()) {
        this.emitUpdate();
        return;
      }
      
      // 更新账户余额到手续费监控器
      if (this.accountSnapshot && this.accountSnapshot.totalWalletBalance) {
        this.feeMonitor.updateBalance(Number(this.accountSnapshot.totalWalletBalance));
      }
      
      this.logStartupState();
      const sma30 = getSMA(this.klineSnapshot, 30);
      if (sma30 == null) {
        return;
      }
      const ticker = this.tickerSnapshot!;
      const price = Number(ticker.lastPrice);
      
      // 动态风险管理 - 检查是否需要更新参数
      await this.updateDynamicRiskIfNeeded(price);
      
      const position = getPosition(this.accountSnapshot, this.config.symbol);

      // 检测手动平仓：如果之前有仓位，现在没有了，且不是通过系统平仓的
      await this.detectManualPositionClose(position, price);

      if (Math.abs(position.positionAmt) < 1e-5) {
        await this.handleOpenPosition(price, sma30);
      } else {
        const result = await this.handlePositionManagement(position, price);
        if (result.closed) {
          // 在仓位完全关闭时同时更新交易计数和盈亏
          this.totalTrades += 1;
          this.totalProfit += result.pnl;
        }
      }

      this.updateSessionVolume(position);
      this.lastSma30 = sma30;
      this.lastPrice = price;
      this.emitUpdate();
    } catch (error) {
      this.tradeLog.push("error", `策略循环异常: ${String(error)}`);
      this.emitUpdate();
    } finally {
      this.processing = false;
    }
  }

  private logStartupState(): void {
    if (this.startupLogged) return;
    const position = getPosition(this.accountSnapshot, this.config.symbol);
    const hasPosition = Math.abs(position.positionAmt) > 1e-5;
    if (hasPosition) {
      this.tradeLog.push(
        "info",
        `检测到已有持仓: ${position.positionAmt > 0 ? "多" : "空"} ${Math.abs(position.positionAmt).toFixed(4)} @ ${position.entryPrice.toFixed(2)}`
      );
    }
    if (this.openOrders.length > 0) {
      this.tradeLog.push("info", `检测到已有挂单 ${this.openOrders.length} 笔，将按策略规则接管`);
    }
    this.startupLogged = true;
  }

  private async handleOpenPosition(currentPrice: number, currentSma: number): Promise<void> {
    this.entryPricePendingLogged = false;
    if (this.lastPrice == null) {
      this.lastPrice = currentPrice;
      return;
    }
    if (this.openOrders.length > 0 && !this.cancelAllRequested) {
      try {
        await this.exchange.cancelAllOrders({ symbol: this.config.symbol });
        this.cancelAllRequested = true;
        // 清空本地挂单与撤单队列，避免在下一轮中基于过期快照继续操作
        this.pendingCancelOrders.clear();
        this.openOrders = [];
      } catch (err) {
        if (isUnknownOrderError(err)) {
          this.tradeLog.push("order", "撤单时部分订单已不存在，忽略");
          this.cancelAllRequested = true;
          // 与成功撤单路径保持一致，立即清空本地缓存，等待订单流推送重建
          this.pendingCancelOrders.clear();
          this.openOrders = [];
        } else {
          this.tradeLog.push("error", `撤销挂单失败: ${String(err)}`);
          this.cancelAllRequested = false;
        }
      }
    }
    if (this.lastPrice > currentSma && currentPrice < currentSma) {
      await this.submitMarketOrder("SELL", currentPrice, "下穿SMA30，市价开空");
    } else if (this.lastPrice < currentSma && currentPrice > currentSma) {
      await this.submitMarketOrder("BUY", currentPrice, "上穿SMA30，市价开多");
    }
  }

  private async submitMarketOrder(side: "BUY" | "SELL", price: number, reason: string): Promise<void> {
    // 检查手续费保护
    if (this.feeMonitor.shouldStopTrading()) {
      this.tradeLog.push("warning", `🚨 手续费保护激活，跳过开仓: ${reason}`);
      return;
    }
    
    // 检查最小持仓时间（高频交易控制）
    if (!this.canPlaceNewOrder()) {
      const manager = (this as any).dynamicRiskManager as DynamicRiskManager | null;
      if (manager) {
        const minHoldTime = manager.calculateRiskParams(price).minHoldTimeMs;
        this.tradeLog.push("info", `⏳ 最小持仓时间未达到 (${minHoldTime}ms)，跳过开仓: ${reason}`);
        return;
      }
    }
    
    try {
      await placeMarketOrder(
        this.exchange,
        this.config.symbol,
        this.openOrders,
        this.locks,
        this.timers,
        this.pending,
        side,
        this.config.tradeAmount,
        (type, detail) => this.tradeLog.push(type, detail),
        false,
        {
          markPrice: getPosition(this.accountSnapshot, this.config.symbol).markPrice,
          expectedPrice: Number(this.tickerSnapshot?.lastPrice) || null,
          maxPct: this.config.maxCloseSlippagePct,
        },
        { qtyStep: this.config.qtyStep }
      );
      
      // 记录详细的开仓信息
      const direction = side === "BUY" ? "多头" : "空头";
      this.tradeLog.push("open", `🎯 ${direction}开仓: ${side} ${this.config.tradeAmount} ${this.config.symbol} @ $${price.toFixed(4)}`);
      this.tradeLog.push("info", `📊 开仓原因: ${reason}`);
      
      // 更新开仓时间戳（高频交易控制）
      this.lastPositionOpenTime = Date.now();
      this.lastOpenPlan = { side, price };
    } catch (err) {
      this.tradeLog.push("error", `市价下单失败: ${String(err)}`);
    }
  }

  private async handlePositionManagement(
    position: PositionSnapshot,
    price: number
  ): Promise<{ closed: boolean; pnl: number }> {
    const hasEntryPrice = Number.isFinite(position.entryPrice) && Math.abs(position.entryPrice) > 1e-8;
    if (!hasEntryPrice) {
      if (!this.entryPricePendingLogged) {
        this.tradeLog.push("info", "持仓均价尚未同步，等待交易所账户快照更新后再执行风控");
        this.entryPricePendingLogged = true;
      }
      return { closed: false, pnl: position.unrealizedProfit };
    }
    this.entryPricePendingLogged = false;
    const direction = position.positionAmt > 0 ? "long" : "short";
    const pnl =
      (direction === "long"
        ? price - position.entryPrice
        : position.entryPrice - price) * Math.abs(position.positionAmt);
    const unrealized = Number.isFinite(position.unrealizedProfit)
      ? position.unrealizedProfit
      : null;
    const stopSide = direction === "long" ? "SELL" : "BUY";
    
    // 高频交易优化：使用更贴近市价的止损价格，基于买1卖1价格
    const marketPrice = Number(this.tickerSnapshot?.lastPrice) || price;
    const bid1Price = Number(this.depthSnapshot?.bids?.[0]?.[0]) || marketPrice;
    const ask1Price = Number(this.depthSnapshot?.asks?.[0]?.[0]) || marketPrice;
    const priceOffsetPct = parseFloat(process.env.MARKET_PRICE_OFFSET_PCT || '0.006');
    
    const stopPrice = direction === "long" 
      ? Math.max(bid1Price - bid1Price * priceOffsetPct, calcStopLossPrice(
          position.entryPrice,
          Math.abs(position.positionAmt),
          direction,
          this.getCurrentLossLimit()
        ))
      : Math.min(ask1Price + ask1Price * priceOffsetPct, calcStopLossPrice(
          position.entryPrice,
          Math.abs(position.positionAmt),
          direction,
          this.getCurrentLossLimit()
        ));
        
    // 记录价格调整信息
    const originalStopPrice = calcStopLossPrice(
      position.entryPrice,
      Math.abs(position.positionAmt),
      direction,
      this.getCurrentLossLimit()
    );
    
    this.tradeLog.push("info", 
      `🎯 常规止损计算: 原始=${originalStopPrice.toFixed(4)}, 优化=${stopPrice.toFixed(4)}, 买1=${bid1Price.toFixed(4)}, 卖1=${ask1Price.toFixed(4)}`
    );
    const activationPrice = calcTrailingActivationPrice(
      position.entryPrice,
      Math.abs(position.positionAmt),
      direction,
      this.getCurrentTrailingProfit()
    );
    
    // 高频交易优化：确保激活价格也相对合理
    const activationOffsetPct = parseFloat(process.env.ACTIVATION_PRICE_OFFSET_PCT || '0.012');
    const activationOffset = marketPrice * activationOffsetPct; // 从环境变量读取激活偏移
    const optimizedActivationPrice = direction === "long"
      ? Math.min(marketPrice + activationOffset, activationPrice)
      : Math.max(marketPrice - activationOffset, activationPrice);
      
    // 记录激活价格调整信息
    if (Math.abs(optimizedActivationPrice - activationPrice) > 0.001) {
      this.tradeLog.push("info", 
        `⚡ 优化追踪激活价格: ${activationPrice.toFixed(4)} → ${optimizedActivationPrice.toFixed(4)} (市价 ${marketPrice.toFixed(4)} ±${(activationOffsetPct*100).toFixed(1)}%)`
      );
    }

    const currentStop = this.openOrders.find(
      (o) => o.type === "STOP_MARKET" && o.side === stopSide
    );
    const currentTrailing = this.openOrders.find(
      (o) => o.type === "TRAILING_STOP_MARKET" && o.side === stopSide
    );

    const profitLockStopPrice = direction === "long"
      ? roundDownToTick(
          position.entryPrice + this.getCurrentProfitLockOffset() / Math.abs(position.positionAmt),
          this.config.priceTick
        )
      : roundDownToTick(
          position.entryPrice - this.getCurrentProfitLockOffset() / Math.abs(position.positionAmt),
          this.config.priceTick
        );

    // 🎯 高频交易优化：利润锁定止损也要贴近市价，但要确保合理性
    const currentMarketPrice = Number(this.tickerSnapshot?.lastPrice) || price;
    
    // 使用买1卖1价格来设定更精确的止损位置
    const bid1 = Number(this.depthSnapshot?.bids?.[0]?.[0]) || currentMarketPrice;
    const ask1 = Number(this.depthSnapshot?.asks?.[0]?.[0]) || currentMarketPrice;
    const marketOffsetPct = parseFloat(process.env.MARKET_PRICE_OFFSET_PCT || '0.006');
    
    // 调试日志：显示价格信息
    this.tradeLog.push("info", 
      `📊 价格数据: 当前价=${currentMarketPrice.toFixed(4)}, 买1=${bid1.toFixed(4)}, 卖1=${ask1.toFixed(4)}, 入场价=${position.entryPrice.toFixed(4)}`
    );
    
    // 只有当我们确实在盈利状态时，才调整利润锁定价格贴近市价
    const isInProfit = (direction === "long" && currentMarketPrice > position.entryPrice) ||
                       (direction === "short" && currentMarketPrice < position.entryPrice);
    
    const optimizedProfitLockStopPrice = isInProfit ? (
      direction === "long"
        ? Math.max(bid1 - bid1 * marketOffsetPct, profitLockStopPrice) // 做多：基于买1价格设置止损
        : Math.min(ask1 + ask1 * marketOffsetPct, profitLockStopPrice)  // 做空：基于卖1价格设置止损
    ) : profitLockStopPrice; // 如果不在盈利，使用原始价格
      
    // 记录利润锁定价格调整
    this.tradeLog.push("info", 
      `🔒 利润锁定计算: 原始=${profitLockStopPrice.toFixed(4)}, 优化=${optimizedProfitLockStopPrice.toFixed(4)}, 方向=${direction}, 盈利=${isInProfit}`
    );

    if (pnl > this.getCurrentProfitLockTrigger() || position.unrealizedProfit > this.getCurrentProfitLockTrigger()) {
      const tick = Math.max(1e-9, this.config.priceTick);
      const profitLockValid =
        (stopSide === "SELL" && optimizedProfitLockStopPrice <= price - tick) ||
        (stopSide === "BUY" && optimizedProfitLockStopPrice >= price + tick);
      if (profitLockValid) {
        if (!currentStop) {
          await this.tryPlaceStopLoss(stopSide, optimizedProfitLockStopPrice, price);
        } else {
          const existingRaw = Number(currentStop.stopPrice);
          const existingPrice = Number.isFinite(existingRaw) ? existingRaw : NaN;
          const improves =
            !Number.isFinite(existingPrice) ||
            (stopSide === "SELL" && optimizedProfitLockStopPrice >= existingPrice + tick) ||
            (stopSide === "BUY" && optimizedProfitLockStopPrice <= existingPrice - tick);
          if (improves) {
            await this.tryReplaceStop(stopSide, currentStop, optimizedProfitLockStopPrice, price);
          }
        }
      }
    }

    if (!currentStop) {
      await this.tryPlaceStopLoss(stopSide, roundDownToTick(stopPrice, this.config.priceTick), price);
      this.tradeLog.push("info", `✅ 创建新止损单: ${stopSide} @ ${stopPrice.toFixed(4)}`);
    } else {
      // 检查现有止损单是否需要更新（基于新的优化价格）
      const existingStopPrice = Number(currentStop.stopPrice);
      const tick = Math.max(1e-9, this.config.priceTick);
      
      // 判断新价格是否显著改进现有止损价格
      const shouldUpdate = !Number.isFinite(existingStopPrice) ||
        (stopSide === "SELL" && stopPrice >= existingStopPrice + tick * 10) || // 做多止损：新价格更高（更安全）
        (stopSide === "BUY" && stopPrice <= existingStopPrice - tick * 10);   // 做空止损：新价格更低（更安全）
      
      if (shouldUpdate) {
        this.tradeLog.push("info", 
          `🔄 现有止损需要更新: ${existingStopPrice.toFixed(4)} → ${stopPrice.toFixed(4)} (改进${Math.abs(stopPrice - existingStopPrice).toFixed(4)})`
        );
        await this.tryReplaceStop(stopSide, currentStop, stopPrice, price);
      } else {
        // 移除频繁的"价格合理"日志，避免UI闪动
        // this.tradeLog.push("info", 
        //   `✓ 现有止损价格合理: ${existingStopPrice.toFixed(4)} vs 计算价格 ${stopPrice.toFixed(4)}`
        // );
      }
    }

    if (!currentTrailing) {
      await this.tryPlaceTrailingStop(
        stopSide,
        roundDownToTick(optimizedActivationPrice, this.config.priceTick),
        Math.abs(position.positionAmt)
      );
    }

    // 集成贪婪止盈策略
    const currentPrice = this.getReferencePrice();
    if (currentPrice == null) {
      return { closed: false, pnl };
    }

    // 1. 首先检查是否应该激活贪婪模式
    const baseTakeProfitPercent = this.getCurrentTakeProfitPercentage();
    const greedyActivated = this.greedyTakeProfitManager.shouldActivateGreedy(
      currentPrice,
      position.entryPrice,
      direction,
      baseTakeProfitPercent
    );

    if (greedyActivated) {
      this.tradeLog.push("info", `🎯 贪婪止盈已激活: 基础止盈达到${(baseTakeProfitPercent*100).toFixed(2)}%，开始等待更高收益`);
    }

    // 2. 如果贪婪模式已激活，检查是否应该止盈
    const greedyResult = this.greedyTakeProfitManager.updateAndCheckTakeProfit(currentPrice);
    
    // 3. 检查标准止盈条件或贪婪止盈决策
    const standardTakeProfit = shouldTakeProfitByPercentage(position, currentPrice, baseTakeProfitPercent);
    const shouldTakeProfit = greedyResult.shouldTakeProfit || (!this.greedyTakeProfitManager.getStateInfo().isActive && standardTakeProfit);

    if (shouldTakeProfit) {
      // 记录止盈原因
      let takeProfitReason = "标准止盈";
      if (greedyResult.shouldTakeProfit) {
        switch (greedyResult.reason) {
          case 'extra_profit_achieved':
            takeProfitReason = `贪婪止盈-额外收益达成 (+${(greedyResult.extraProfit! * 100).toFixed(2)}%)`;
            break;
          case 'price_reversal_detected':
            takeProfitReason = `贪婪止盈-价格反转 (+${(greedyResult.extraProfit! * 100).toFixed(2)}%)`;
            break;
          case 'greedy_timeout':
            takeProfitReason = `贪婪止盈-超时平仓 (+${(greedyResult.extraProfit! * 100).toFixed(2)}%)`;
            break;
        }
      }

      try {
        if (this.openOrders.length > 0) {
          const orderIdList = this.openOrders.map((order) => order.orderId);
          try {
            await this.exchange.cancelOrders({ symbol: this.config.symbol, orderIdList });
            orderIdList.forEach((id) => this.pendingCancelOrders.add(id));
          } catch (err) {
            if (isUnknownOrderError(err)) {
              this.tradeLog.push("order", "止盈前撤单发现订单已不存在");
              for (const id of orderIdList) {
                this.pendingCancelOrders.delete(id);
              }
              this.openOrders = this.openOrders.filter((o) => !orderIdList.includes(o.orderId));
            } else {
              throw err;
            }
          }
        }
        
        // 价格操纵保护：仅当平仓方向价格与标记价格偏离在阈值内才执行市价平仓
        const mark = getPosition(this.accountSnapshot, this.config.symbol).markPrice;
        const limitPct = this.config.maxCloseSlippagePct;
        const sideIsSell = direction === "long";
        const depthBid = Number(this.depthSnapshot?.bids?.[0]?.[0]);
        const depthAsk = Number(this.depthSnapshot?.asks?.[0]?.[0]);
        const closeSidePrice = sideIsSell ? depthBid : depthAsk;
        if (mark != null && Number.isFinite(mark) && mark > 0 && Number.isFinite(closeSidePrice)) {
          const pctDiff = Math.abs(closeSidePrice - mark) / mark;
          if (pctDiff > limitPct) {
            this.tradeLog.push(
              "info",
              `市价平仓保护触发：closePx=${Number(closeSidePrice).toFixed(2)} mark=${mark.toFixed(2)} 偏离 ${(pctDiff * 100).toFixed(2)}% > ${(limitPct * 100).toFixed(2)}%`
            );
            return { closed: false, pnl };
          }
        }
        
        await marketClose(
          this.exchange,
          this.config.symbol,
          this.openOrders,
          this.locks,
          this.timers,
          this.pending,
          direction === "long" ? "SELL" : "BUY",
          Math.abs(position.positionAmt),
          (type, detail) => this.tradeLog.push(type, detail),
          {
            markPrice: getPosition(this.accountSnapshot, this.config.symbol).markPrice,
            expectedPrice: Number(
              direction === "long"
                ? this.depthSnapshot?.bids?.[0]?.[0]
                : this.depthSnapshot?.asks?.[0]?.[0]
            ) || null,
            maxPct: this.config.maxCloseSlippagePct,
        },
        { qtyStep: this.config.qtyStep }
        );
        
        const totalProfit = (currentPrice - position.entryPrice) * Math.abs(position.positionAmt) * (direction === "long" ? 1 : -1);
        const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * (direction === "long" ? 1 : -1);
        
        this.tradeLog.push("close", `💰 ${takeProfitReason}: ${direction === "long" ? "SELL" : "BUY"} @ $${currentPrice.toFixed(4)}`);
        this.tradeLog.push("info", `📊 止盈盈利: $${totalProfit.toFixed(4)} USDT (${profitPercent.toFixed(2)}%)`);
        this.tradeLog.push("info", `📈 持仓详情: ${direction === "long" ? "多头" : "空头"} ${Math.abs(position.positionAmt)} ${this.config.symbol} (成本: $${position.entryPrice.toFixed(4)})`);
        
        // 强制退出贪婪模式
        this.greedyTakeProfitManager.forceExit();
        this.lastPositionCloseTime = Date.now();
        return { closed: true, pnl };
      } catch (err) {
        this.tradeLog.push("error", `止盈失败: ${String(err)}`);
        // 出错时也要退出贪婪模式
        this.greedyTakeProfitManager.forceExit();
        return { closed: false, pnl };
      }
    }

    // 使用百分比止损而不是固定金额
    const shouldStopLoss = currentPrice != null && 
      shouldStopLossByPercentage(position, currentPrice, this.getCurrentStopLossPercentage());

    if (shouldStopLoss) {
      try {
        if (this.openOrders.length > 0) {
          const orderIdList = this.openOrders.map((order) => order.orderId);
          try {
            await this.exchange.cancelOrders({ symbol: this.config.symbol, orderIdList });
            orderIdList.forEach((id) => this.pendingCancelOrders.add(id));
          } catch (err) {
            if (isUnknownOrderError(err)) {
              this.tradeLog.push("order", "止损前撤单发现订单已不存在");
                // 清理本地缓存，避免重复对同一订单执行撤单
                for (const id of orderIdList) {
                  this.pendingCancelOrders.delete(id);
                }
                this.openOrders = this.openOrders.filter((o) => !orderIdList.includes(o.orderId));
            } else {
              throw err;
            }
          }
        }
        // 价格操纵保护：仅当平仓方向价格与标记价格偏离在阈值内才执行市价平仓
        const mark = getPosition(this.accountSnapshot, this.config.symbol).markPrice;
        const limitPct = this.config.maxCloseSlippagePct;
        const sideIsSell = direction === "long";
        const depthBid = Number(this.depthSnapshot?.bids?.[0]?.[0]);
        const depthAsk = Number(this.depthSnapshot?.asks?.[0]?.[0]);
        const closeSidePrice = sideIsSell ? depthBid : depthAsk;
        if (mark != null && Number.isFinite(mark) && mark > 0 && Number.isFinite(closeSidePrice)) {
          const pctDiff = Math.abs(closeSidePrice - mark) / mark;
          if (pctDiff > limitPct) {
            this.tradeLog.push(
              "info",
              `市价平仓保护触发：closePx=${Number(closeSidePrice).toFixed(2)} mark=${mark.toFixed(2)} 偏离 ${(pctDiff * 100).toFixed(2)}% > ${(limitPct * 100).toFixed(2)}%`
            );
            return { closed: false, pnl };
          }
        }
        await marketClose(
          this.exchange,
          this.config.symbol,
          this.openOrders,
          this.locks,
          this.timers,
          this.pending,
          direction === "long" ? "SELL" : "BUY",
          Math.abs(position.positionAmt),
          (type, detail) => this.tradeLog.push(type, detail),
          {
            markPrice: getPosition(this.accountSnapshot, this.config.symbol).markPrice,
            expectedPrice: Number(
              direction === "long"
                ? this.depthSnapshot?.bids?.[0]?.[0]
                : this.depthSnapshot?.asks?.[0]?.[0]
            ) || null,
            maxPct: this.config.maxCloseSlippagePct,
        },
        { qtyStep: this.config.qtyStep }
        );
        const lossAmount = ((currentPrice - position.entryPrice) * Math.abs(position.positionAmt) * (direction === "long" ? 1 : -1));
        const lossPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * (direction === "long" ? 1 : -1);
        this.tradeLog.push("close", `⛔ 百分比止损平仓: ${direction === "long" ? "SELL" : "BUY"} @ $${currentPrice.toFixed(4)}`);
        this.tradeLog.push("info", `📊 止损亏损: $${lossAmount.toFixed(4)} USDT (${lossPercent.toFixed(2)}%)`);
        this.tradeLog.push("info", `📉 持仓详情: ${direction === "long" ? "多头" : "空头"} ${Math.abs(position.positionAmt)} ${this.config.symbol} (成本: $${position.entryPrice.toFixed(4)})`);
        
        // 更新平仓时间戳（高频交易控制）
        this.lastPositionCloseTime = Date.now();
      } catch (err) {
        if (isUnknownOrderError(err)) {
          this.tradeLog.push("order", "止损平仓时目标订单已不存在");
        } else {
          this.tradeLog.push("error", `止损平仓失败: ${String(err)}`);
        }
      }
      return { closed: true, pnl };
    }

    return { closed: false, pnl };
  }

  private async tryPlaceStopLoss(
    side: "BUY" | "SELL",
    stopPrice: number,
    lastPrice: number
  ): Promise<void> {
    try {
      const position = getPosition(this.accountSnapshot, this.config.symbol);
      const quantity = Math.abs(position.positionAmt) || this.config.tradeAmount;
      await placeStopLossOrder(
        this.exchange,
        this.config.symbol,
        this.openOrders,
        this.locks,
        this.timers,
        this.pending,
        side,
        stopPrice,
        quantity,
        lastPrice,
        (type, detail) => this.tradeLog.push(type, detail),
        {
          markPrice: position.markPrice,
          maxPct: this.config.maxCloseSlippagePct,
        },
        { priceTick: this.config.priceTick, qtyStep: this.config.qtyStep }
      );
    } catch (err) {
      this.tradeLog.push("error", `挂止损单失败: ${String(err)}`);
    }
  }

  private async tryReplaceStop(
    side: "BUY" | "SELL",
    currentOrder: AsterOrder,
    nextStopPrice: number,
    lastPrice: number
  ): Promise<void> {
    // 预校验：SELL 止损价必须低于当前价；BUY 止损价必须高于当前价
    const invalidForSide =
      (side === "SELL" && nextStopPrice >= lastPrice) ||
      (side === "BUY" && nextStopPrice <= lastPrice);
    if (invalidForSide) {
      // 目标止损价与当前价冲突时跳过移动，避免反复撤单/重下导致的循环
      return;
    }
    const existingStopPrice = Number(currentOrder.stopPrice);
    try {
      await this.exchange.cancelOrder({ symbol: this.config.symbol, orderId: currentOrder.orderId });
    } catch (err) {
      if (isUnknownOrderError(err)) {
        this.tradeLog.push("order", "原止损单已不存在，跳过撤销");
        // 订单已不存在，移除本地记录，防止后续重复匹配
        this.openOrders = this.openOrders.filter((o) => o.orderId !== currentOrder.orderId);
      } else {
        this.tradeLog.push("error", `取消原止损单失败: ${String(err)}`);
      }
    }
    // 仅在成功创建新止损单后记录“移动止损”日志
    try {
      const position = getPosition(this.accountSnapshot, this.config.symbol);
      const quantity = Math.abs(position.positionAmt) || this.config.tradeAmount;
      const order = await placeStopLossOrder(
        this.exchange,
        this.config.symbol,
        this.openOrders,
        this.locks,
        this.timers,
        this.pending,
        side,
        nextStopPrice,
        quantity,
        lastPrice,
        (type, detail) => this.tradeLog.push(type, detail),
        {
          markPrice: position.markPrice,
          maxPct: this.config.maxCloseSlippagePct,
        },
        { priceTick: this.config.priceTick, qtyStep: this.config.qtyStep }
      );
      if (order) {
        this.tradeLog.push("stop", `移动止损到 ${roundDownToTick(nextStopPrice, this.config.priceTick)}`);
      }
    } catch (err) {
      this.tradeLog.push("error", `移动止损失败: ${String(err)}`);
      // 回滚策略：尝试用原价恢复止损，以避免出现短时间内无止损保护
      try {
        const position = getPosition(this.accountSnapshot, this.config.symbol);
        const quantity = Math.abs(position.positionAmt) || this.config.tradeAmount;
        const restoreInvalid =
          (side === "SELL" && existingStopPrice >= lastPrice) ||
          (side === "BUY" && existingStopPrice <= lastPrice);
        if (!restoreInvalid) {
          const restored = await placeStopLossOrder(
            this.exchange,
            this.config.symbol,
            this.openOrders,
            this.locks,
            this.timers,
            this.pending,
            side,
            existingStopPrice,
            quantity,
            lastPrice,
            (t, d) => this.tradeLog.push(t, d),
            {
              markPrice: position.markPrice,
              maxPct: this.config.maxCloseSlippagePct,
            },
            { priceTick: this.config.priceTick, qtyStep: this.config.qtyStep }
          );
          if (restored) {
            this.tradeLog.push("order", `恢复原止损 @ ${roundDownToTick(existingStopPrice, this.config.priceTick)}`);
          }
        }
      } catch (recoverErr) {
        this.tradeLog.push("error", `恢复原止损失败: ${String(recoverErr)}`);
      }
    }
  }

  private async tryPlaceTrailingStop(
    side: "BUY" | "SELL",
    activationPrice: number,
    quantity: number
  ): Promise<void> {
    try {
      await placeTrailingStopOrder(
        this.exchange,
        this.config.symbol,
        this.openOrders,
        this.locks,
        this.timers,
        this.pending,
        side,
        activationPrice,
        quantity,
        this.config.trailingCallbackRate,
        (type, detail) => this.tradeLog.push(type, detail),
        {
          markPrice: getPosition(this.accountSnapshot, this.config.symbol).markPrice,
          maxPct: this.config.maxCloseSlippagePct,
        },
        { priceTick: this.config.priceTick, qtyStep: this.config.qtyStep }
      );
    } catch (err) {
      this.tradeLog.push("error", `挂动态止盈失败: ${String(err)}`);
    }
  }

  private emitUpdate(): void {
    try {
      const snapshot = this.buildSnapshot();
      const handlers = this.listeners.get("update");
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(snapshot);
          } catch (err) {
            this.tradeLog.push("error", `更新回调处理异常: ${String(err)}`);
          }
        });
      }
    } catch (err) {
      this.tradeLog.push("error", `快照或更新分发异常: ${String(err)}`);
    }
  }

  private buildSnapshot(): TrendEngineSnapshot {
    const position = getPosition(this.accountSnapshot, this.config.symbol);
    const price = this.tickerSnapshot ? Number(this.tickerSnapshot.lastPrice) : null;
    const sma30 = this.lastSma30;
    const trend = price == null || sma30 == null
      ? "无信号"
      : price > sma30
      ? "做多"
      : price < sma30
      ? "做空"
      : "无信号";
    const pnl = price != null ? computePositionPnl(position, price, price) : 0;
    return {
      ready: this.isReady(),
      symbol: this.config.symbol,
      lastPrice: price,
      sma30,
      trend,
      position,
      pnl,
      unrealized: position.unrealizedProfit,
      totalProfit: this.totalProfit,
      totalTrades: this.totalTrades,
      sessionVolume: this.sessionQuoteVolume,
      tradeLog: this.tradeLog.all(),
      openOrders: this.openOrders,
      depth: this.depthSnapshot,
      ticker: this.tickerSnapshot,
      lastUpdated: Date.now(),
      lastOpenSignal: this.lastOpenPlan,
      feeStats: this.feeMonitor.getFeeStats(),
      // 当前实际使用的风险参数
      currentRiskParams: {
        lossLimit: this.getCurrentLossLimit(),
        trailingProfit: this.getCurrentTrailingProfit(),
        profitLockTrigger: this.getCurrentProfitLockTrigger(),
        profitLockOffset: this.getCurrentProfitLockOffset(),
        isDynamic: this.config.enableDynamicRisk && this.dynamicLossLimit !== null
      },
      // 贪婪止盈状态
      greedyTakeProfit: this.greedyTakeProfitManager.getStateInfo()
    };
  }

  getFeeStats(): FeeStats {
    return this.feeMonitor.getFeeStats();
  }

  /**
   * 动态风险管理 - 根据价格变化更新风险参数
   */
  private async updateDynamicRiskIfNeeded(currentPrice: number): Promise<void> {
    const manager = (this as any).dynamicRiskManager as DynamicRiskManager | null;
    if (!manager || !this.config.enableDynamicRisk) {
      return;
    }

    // 如果是首次计算（动态参数为null）或者价格变化超过阈值，则重新计算
    const isFirstCalculation = this.dynamicLossLimit === null;
    const shouldRecalculate = isFirstCalculation || 
      manager.shouldRecalculate(currentPrice, this.lastRiskUpdatePrice || 0, this.config.dynamicRiskThreshold);
    
    if (!shouldRecalculate) {
      return;
    }

    try {
      // 计算新的风险参数
      const newParams = manager.calculateRiskParams(currentPrice);
      
      // 更新内部动态参数（完全替代静态配置）
      this.dynamicLossLimit = newParams.lossLimit;
      this.dynamicTrailingProfit = newParams.trailingProfit;
      this.dynamicProfitLockTrigger = newParams.profitLockTrigger;
      this.dynamicProfitLockOffset = newParams.profitLockOffset;

      // 记录更新日志 (减少频繁输出，避免UI闪动)
      if (isFirstCalculation) {
        this.tradeLog.push("info", `🎯 动态风险参数初始化 (价格: $${currentPrice.toFixed(3)})`);
        const summary = manager.getUpdateSummary(newParams, currentPrice);
        this.tradeLog.push("info", summary);
      } else {
        // 参数更新时不记录详细日志，避免频繁输出
        // const summary = manager.getUpdateSummary(newParams, currentPrice);
        // this.tradeLog.push("info", summary);
      }
      
      this.lastRiskUpdatePrice = currentPrice;
      
    } catch (error) {
      this.tradeLog.push("error", `动态风险管理更新失败: ${String(error)}`);
    }
  }

  /**
   * 获取当前有效的风险参数（动态参数优先，否则使用配置默认值）
   */
  private getCurrentLossLimit(): number {
    // 如果启用动态风险管理，优先使用动态参数
    if (this.config.enableDynamicRisk && this.dynamicLossLimit !== null) {
      return this.dynamicLossLimit;
    }
    return this.config.lossLimit;
  }

  /**
   * 获取当前止损百分比（用于百分比止损）
   */
  private getCurrentStopLossPercentage(): number {
    if (this.config.enableDynamicRisk) {
      // 从环境变量读取百分比配置
      return parseFloat(process.env.RISK_PERCENTAGE || '0.0075');
    }
    // 如果未启用动态风险管理，从固定金额推算百分比
    const currentPrice = this.lastPrice || 1.85;
    const positionValue = this.config.tradeAmount * currentPrice;
    return this.config.lossLimit / positionValue;
  }

  /**
   * 获取当前止盈百分比（用于百分比止盈）
   */
  private getCurrentTakeProfitPercentage(): number {
    if (this.config.enableDynamicRisk) {
      // 从环境变量读取百分比配置
      return parseFloat(process.env.PROFIT_TARGET_PERCENTAGE || '0.015');
    }
    // 如果未启用动态风险管理，从固定金额推算百分比
    const currentPrice = this.lastPrice || 1.85;
    const positionValue = this.config.tradeAmount * currentPrice;
    return this.config.trailingProfit / positionValue;
  }

  private getCurrentTrailingProfit(): number {
    if (this.config.enableDynamicRisk && this.dynamicTrailingProfit !== null) {
      return this.dynamicTrailingProfit;
    }
    return this.config.trailingProfit;
  }

  private getCurrentProfitLockTrigger(): number {
    if (this.config.enableDynamicRisk && this.dynamicProfitLockTrigger !== null) {
      return this.dynamicProfitLockTrigger;
    }
    return this.config.profitLockTriggerUsd;
  }

  private getCurrentProfitLockOffset(): number {
    if (this.config.enableDynamicRisk && this.dynamicProfitLockOffset !== null) {
      return this.dynamicProfitLockOffset;
    }
    return this.config.profitLockOffsetUsd;
  }

  private updateSessionVolume(position: PositionSnapshot): void {
    const price = this.getReferencePrice();
    if (!this.initializedPosition) {
      this.prevPositionAmt = position.positionAmt;
      this.initializedPosition = true;
      return;
    }
    if (price == null) {
      this.prevPositionAmt = position.positionAmt;
      return;
    }
    const delta = Math.abs(position.positionAmt - this.prevPositionAmt);
    if (delta > 0) {
      this.sessionQuoteVolume += delta * price;
    }
    this.prevPositionAmt = position.positionAmt;
  }

  private getReferencePrice(): number | null {
    return getMidOrLast(this.depthSnapshot, this.tickerSnapshot) ?? (this.lastPrice != null && Number.isFinite(this.lastPrice) ? this.lastPrice : null);
  }

}
