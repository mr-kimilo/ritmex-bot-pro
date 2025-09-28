import dotenv from 'dotenv';
import type { TradingConfig } from './config.ts';
import { ApiConfigManager, type ApiCredentials } from './api-config-manager.ts';

export class ConfigManager {
  private config!: TradingConfig;
  private configFile: string;
  private apiConfigManager: ApiConfigManager;

  constructor(configFile?: string) {
    this.configFile = configFile || this.getDefaultConfigFile();
    this.apiConfigManager = new ApiConfigManager();
    this.loadConfig();
  }

  /**
   * 获取默认配置文件(基于npm脚本路由)
   */
  private getDefaultConfigFile(): string {
    let configFile = './config/.env';

    // 根据npm脚本名称推断配置文件
    if (process.env.npm_lifecycle_event) {
      const event = process.env.npm_lifecycle_event;
      if (event.includes(':bnb') && !event.includes('-')) {
        configFile = './config/.env.bnb';
      } else if (event.includes(':sol') && !event.includes('-')) {
        configFile = './config/.env.sol';
      } else if (event.includes('bnb-sol')) {
        configFile = './config/.env.bnb.sol';
      } else if (event.includes('bnb-aster')) {
        configFile = './config/.env.bnb.aster';
      }
    }

    return configFile;
  }

  private loadConfig(): void {
    // 清除之前的环境变量
    delete process.env.TRADE_SYMBOL;
    delete process.env.TRADE_AMOUNT;
    delete process.env.LOSS_LIMIT;
    delete process.env.REDIS_DB;
    delete process.env.REDIS_KEY_PREFIX;
    
    // 加载指定的配置文件
    const result = dotenv.config({ path: this.configFile });
    
    if (result.error) {
      console.warn(`⚠️ 配置文件 ${this.configFile} 加载失败，使用默认配置`);
    } else {
      console.log(`✅ 已加载配置文件: ${this.configFile}`);
    }

    // 解析配置
    this.config = this.parseConfig();
  }

  private parseNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (!value) return fallback;
    return value.toLowerCase() === 'true';
  }

  private parseConfig(): TradingConfig {
    return {
      symbol: process.env.TRADE_SYMBOL ?? "BTCUSDT",
      tradeAmount: this.parseNumber(process.env.TRADE_AMOUNT, 0.001),
      lossLimit: this.parseNumber(process.env.LOSS_LIMIT, 0.03),
      trailingProfit: this.parseNumber(process.env.TRAILING_PROFIT, 0.2),
      trailingCallbackRate: this.parseNumber(process.env.TRAILING_CALLBACK_RATE, 0.2),
      profitLockTriggerUsd: this.parseNumber(process.env.PROFIT_LOCK_TRIGGER_USD, 0.1),
      profitLockOffsetUsd: this.parseNumber(process.env.PROFIT_LOCK_OFFSET_USD, 0.05),
      pollIntervalMs: this.parseNumber(process.env.POLL_INTERVAL_MS, 500),
      maxLogEntries: this.parseNumber(process.env.MAX_LOG_ENTRIES, 200),
      klineInterval: process.env.KLINE_INTERVAL ?? "1m",
      maxCloseSlippagePct: this.parseNumber(process.env.MAX_CLOSE_SLIPPAGE_PCT, 0.3),
      priceTick: this.parseNumber(process.env.PRICE_TICK, 0.1),
      qtyStep: this.parseNumber(process.env.QTY_STEP, 0.001),
      
      // Fee monitoring settings
      feeRate: this.parseNumber(process.env.FEE_RATE, 0.0005),
      maxDailyFeePct: this.parseNumber(process.env.MAX_DAILY_FEE_PCT, 2.0),
      maxHourlyFeePct: this.parseNumber(process.env.MAX_HOURLY_FEE_PCT, 0.5),
      feeWarningThreshold: this.parseNumber(process.env.FEE_WARNING_THRESHOLD, 1.0),
      enableFeeProtection: this.parseBoolean(process.env.ENABLE_FEE_PROTECTION, true),
      logFeeSummaryInterval: this.parseNumber(process.env.LOG_FEE_SUMMARY_INTERVAL, 300000),
      resetFeeCounterHour: this.parseNumber(process.env.RESET_FEE_COUNTER_HOUR, 0),
      
      // Dynamic risk management settings
      enableDynamicRisk: this.parseBoolean(process.env.ENABLE_DYNAMIC_RISK, false),
      dynamicRiskThreshold: this.parseNumber(process.env.DYNAMIC_RISK_THRESHOLD, 0.05),
      riskPercentage: this.parseNumber(process.env.RISK_PERCENTAGE, 2.0),
      profitTargetPercentage: this.parseNumber(process.env.PROFIT_TARGET_PERCENTAGE, 1.0)
    };
  }

  /**
   * 获取配置
   */
  getConfig(): TradingConfig {
    return this.config;
  }

  /**
   * 重新加载配置
   */
  reloadConfig(): void {
    this.loadConfig();
  }

  /**
   * 获取实例名称（基于交易对）
   */
  getInstanceName(): string {
    return this.config.symbol.replace('USDT', '').toLowerCase();
  }

  /**
   * 根据当前配置获取API凭据
   */
  getApiCredentials(): ApiCredentials {
    const instanceName = this.deriveInstanceNameFromConfig();
    try {
      return this.apiConfigManager.getApiCredentials(instanceName);
    } catch (error) {
      console.warn(`⚠️ 无法从API配置文件获取 ${instanceName} 的凭据，使用环境变量`);
      // 回退到环境变量
      return {
        name: `${instanceName.toUpperCase()} 环境变量`,
        apiKey: process.env.ASTER_API_KEY || '',
        apiSecret: process.env.ASTER_API_SECRET || '',
        baseUrl: process.env.ASTER_API_URL || 'https://api.aster-bot.com',
        description: '从环境变量读取的API凭据'
      };
    }
  }

  /**
   * 根据配置文件名和交易对推断实例名称
   */
  private deriveInstanceNameFromConfig(): string {
    // 根据配置文件名推断实例类型
    if (this.configFile.includes('.env.bnb.sol')) {
      return 'bnb-sol';
    } else if (this.configFile.includes('.env.bnb.aster')) {
      return 'bnb-aster';
    } else if (this.configFile.includes('.env.bnb')) {
      return 'bnb';
    } else if (this.configFile.includes('.env.sol')) {
      return 'sol';
    }
    
    // 默认根据交易对推断
    return this.getInstanceName();
  }

  /**
   * 获取API配置管理器
   */
  getApiConfigManager(): ApiConfigManager {
    return this.apiConfigManager;
  }

  /**
   * 显示配置摘要
   */
  showConfigSummary(): void {
    console.log(`\n📋 === ${this.getInstanceName().toUpperCase()} 实例配置 ===`);
    console.log(`🎯 交易对: ${this.config.symbol}`);
    console.log(`💰 交易数量: ${this.config.tradeAmount}`);
    console.log(`📉 止损限制: ${(this.config.lossLimit * 100).toFixed(2)}%`);
    console.log(`📈 追踪止盈: ${(this.config.trailingProfit * 100).toFixed(2)}%`);
    console.log(`⚡ 轮询间隔: ${this.config.pollIntervalMs}ms`);
    console.log(`🛡️ 手续费保护: ${this.config.enableFeeProtection ? '启用' : '禁用'}`);
    console.log(`🎰 动态风险: ${this.config.enableDynamicRisk ? '启用' : '禁用'}`);
    
    // 显示API配置信息
    try {
      const apiCredentials = this.getApiCredentials();
      console.log(`🔑 API配置: ${apiCredentials.name}`);
      console.log(`🌐 API地址: ${apiCredentials.baseUrl}`);
      console.log(`🔐 API密钥: ${apiCredentials.apiKey ? `${apiCredentials.apiKey.slice(0, 8)}...` : '未配置'}`);
    } catch (error) {
      console.log(`🔑 API配置: 使用环境变量`);
    }
    
    console.log(`📁 配置文件: ${this.configFile}`);
    console.log(`========================\n`);
  }

  /**
   * 验证配置有效性
   */
  validateConfig(): boolean {
    const errors: string[] = [];

    if (!this.config.symbol) {
      errors.push('交易对 (TRADE_SYMBOL) 不能为空');
    }

    if (this.config.tradeAmount <= 0) {
      errors.push('交易数量 (TRADE_AMOUNT) 必须大于0');
    }

    if (this.config.lossLimit <= 0 || this.config.lossLimit >= 1) {
      errors.push('止损限制 (LOSS_LIMIT) 必须在0-1之间');
    }

    if (this.config.pollIntervalMs < 100) {
      errors.push('轮询间隔 (POLL_INTERVAL_MS) 不能少于100ms');
    }

    if (errors.length > 0) {
      console.error('❌ 配置验证失败:');
      errors.forEach(error => console.error(`   - ${error}`));
      return false;
    }

    console.log('✅ 配置验证通过');
    return true;
  }
}
