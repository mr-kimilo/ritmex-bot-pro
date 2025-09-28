import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import type { ExchangeAdapter } from '../exchanges/adapter';
import type { AsterKline } from '../exchanges/types';

export interface KlineData {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  trades: number;
  timestamp: number;
}

export interface KlineManagerConfig {
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  cacheTtl: number; // 缓存过期时间（秒）
  maxKlines: number; // 最大K线数量
  keyPrefix?: string; // 缓存键前缀
}

export class RedisKlineManager {
  private client: RedisClientType;
  private config: KlineManagerConfig;
  private isConnected = false;

  constructor(config: KlineManagerConfig) {
    this.config = config;
    this.client = createClient({
      socket: {
        host: config.redisHost,
        port: config.redisPort,
      },
      password: config.redisPassword,
    }) as RedisClientType;
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('🔗 Redis连接建立中...');
    });

    this.client.on('ready', () => {
      console.log('✅ Redis连接就绪');
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis连接错误:', err);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('📴 Redis连接关闭');
      this.isConnected = false;
    });
  }

  /**
   * 连接到Redis服务器
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        console.log('🚀 Redis K线管理器已启动');
      } catch (error) {
        console.error('❌ Redis连接失败:', error);
        throw error;
      }
    }
  }

  /**
   * 断开Redis连接
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * 获取Redis键名
   */
  private getKlineKey(symbol: string, interval: string): string {
    return `kline:${symbol}:${interval}`;
  }

  private getAnalysisKey(symbol: string): string {
    return `analysis:${symbol}`;
  }

  /**
   * 从交易所获取K线数据
   */
  async fetchKlinesFromExchange(
    exchange: ExchangeAdapter,
    symbol: string,
    interval: string,
    limit: number
  ): Promise<KlineData[]> {
    try {
      console.log(`📊 从交易所获取${symbol}的${interval}K线数据，数量:${limit}`);
      
      // 这里需要根据具体的交易所API实现
      // 暂时返回模拟数据，实际使用时需要调用exchange的相关方法
      const klines = await exchange.getKlines(symbol, interval, limit);
      
      return klines.map((kline: AsterKline, index: number) => ({
        symbol,
        interval,
        openTime: kline.openTime,
        closeTime: kline.closeTime,
        open: Number(kline.open),
        high: Number(kline.high),
        low: Number(kline.low),
        close: Number(kline.close),
        volume: Number(kline.volume),
        quoteVolume: Number(kline.quoteAssetVolume || kline.volume),
        trades: kline.numberOfTrades || 0,
        timestamp: Date.now() - (limit - index) * this.getIntervalMs(interval),
      }));
    } catch (error) {
      console.error(`❌ 获取K线数据失败:`, error);
      throw error;
    }
  }

  /**
   * 将K线数据存储到Redis
   */
  async storeKlines(klines: KlineData[]): Promise<void> {
    if (!this.isConnected || klines.length === 0) return;

    const firstKline = klines[0];
    if (!firstKline) return;

    const symbol = firstKline.symbol;
    const interval = firstKline.interval;
    const key = this.getKlineKey(symbol, interval);

    try {
      // 使用Redis List存储K线数据，按时间顺序排列
      const pipeline = this.client.multi();
      
      // 清空旧数据
      pipeline.del(key);
      
      // 存储新数据（按时间顺序）
      for (const kline of klines.sort((a, b) => a.openTime - b.openTime)) {
        pipeline.rPush(key, JSON.stringify(kline));
      }
      
      // 设置过期时间
      pipeline.expire(key, this.config.cacheTtl);
      
      await pipeline.exec();
      
      console.log(`💾 已存储${klines.length}条${symbol}的${interval}K线数据到Redis`);
    } catch (error) {
      console.error('❌ 存储K线数据到Redis失败:', error);
      throw error;
    }
  }

  /**
   * 从Redis获取K线数据
   */
  async getKlines(symbol: string, interval: string): Promise<KlineData[]> {
    if (!this.isConnected) return [];

    const key = this.getKlineKey(symbol, interval);
    
    try {
      const rawKlines = await this.client.lRange(key, 0, -1);
      return rawKlines.map(raw => JSON.parse(raw) as KlineData);
    } catch (error) {
      console.error('❌ 从Redis获取K线数据失败:', error);
      return [];
    }
  }

  /**
   * 更新单条K线数据
   */
  async updateKline(kline: KlineData): Promise<void> {
    if (!this.isConnected) return;

    const key = this.getKlineKey(kline.symbol, kline.interval);
    
    try {
      // 获取最新的K线，看是否需要更新还是添加新的
      const latestRaw = await this.client.lIndex(key, -1);
      
      if (latestRaw && typeof latestRaw === 'string') {
        const latest = JSON.parse(latestRaw) as KlineData;
        
        if (latest.openTime === kline.openTime) {
          // 更新现有K线（当前周期未结束）
          await this.client.lSet(key, -1, JSON.stringify(kline));
          console.log(`🔄 更新${kline.symbol}的${kline.interval}K线数据`);
        } else if (kline.openTime > latest.openTime) {
          // 添加新K线
          await this.client.rPush(key, JSON.stringify(kline));
          
          // 保持数据量不超过限制
          const length = await this.client.lLen(key);
          if (length > this.config.maxKlines) {
            await this.client.lTrim(key, -this.config.maxKlines, -1);
          }
          
          console.log(`➕ 添加新的${kline.symbol}的${kline.interval}K线数据`);
        }
      } else {
        // 第一条K线
        await this.client.rPush(key, JSON.stringify(kline));
        await this.client.expire(key, this.config.cacheTtl);
        console.log(`🎯 添加首条${kline.symbol}的${kline.interval}K线数据`);
      }
    } catch (error) {
      console.error('❌ 更新K线数据失败:', error);
    }
  }

  /**
   * 检查数据是否需要刷新
   */
  async needsRefresh(symbol: string, interval: string): Promise<boolean> {
    if (!this.isConnected) return true;

    const key = this.getKlineKey(symbol, interval);
    const ttl = await this.client.ttl(key);
    
    // TTL小于一半时刷新，或者数据不存在
    return ttl < this.config.cacheTtl / 2;
  }

  /**
   * 获取最近N小时内的最高价和最低价
   */
  async getPriceRange(
    symbol: string, 
    interval: string, 
    hours: number
  ): Promise<{ high: number; low: number; highTime: number; lowTime: number } | null> {
    const klines = await this.getKlines(symbol, interval);
    if (klines.length === 0) return null;

    const hoursMs = hours * 60 * 60 * 1000;
    const cutoffTime = Date.now() - hoursMs;
    
    // 过滤最近N小时的数据
    const recentKlines = klines.filter(k => k.timestamp >= cutoffTime);
    if (recentKlines.length === 0) return null;

    const firstKline = recentKlines[0];
    if (!firstKline) return null;

    let high = firstKline.high;
    let low = firstKline.low;
    let highTime = firstKline.timestamp;
    let lowTime = firstKline.timestamp;

    for (const kline of recentKlines) {
      if (kline.high > high) {
        high = kline.high;
        highTime = kline.timestamp;
      }
      if (kline.low < low) {
        low = kline.low;
        lowTime = kline.timestamp;
      }
    }

    return { high, low, highTime, lowTime };
  }

  /**
   * 存储分析结果
   */
  async storeAnalysis(symbol: string, analysis: any): Promise<void> {
    if (!this.isConnected) return;

    const key = this.getAnalysisKey(symbol);
    
    try {
      await this.client.setEx(
        key,
        300, // 5分钟缓存
        JSON.stringify({
          ...analysis,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.error('❌ 存储分析结果失败:', error);
    }
  }

  /**
   * 获取分析结果
   */
  async getAnalysis(symbol: string): Promise<any | null> {
    if (!this.isConnected) return null;

    const key = this.getAnalysisKey(symbol);
    
    try {
      const raw = await this.client.get(key);
      return raw && typeof raw === 'string' ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('❌ 获取分析结果失败:', error);
      return null;
    }
  }

  /**
   * 转换时间间隔为毫秒
   */
  private getIntervalMs(interval: string): number {
    const unit = interval.slice(-1);
    const value = parseInt(interval.slice(0, -1));
    
    switch (unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60 * 1000; // 默认1分钟
    }
  }

  /**
   * 获取连接状态
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * 清理指定符号的所有数据
   */
  async clearSymbolData(symbol: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      const pattern = `*${symbol}*`;
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`🧹 清理了${symbol}的${keys.length}个缓存键`);
      }
    } catch (error) {
      console.error('❌ 清理数据失败:', error);
    }
  }
}
