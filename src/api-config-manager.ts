import fs from 'fs';
import path from 'path';

export interface ApiCredentials {
  name: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  description?: string;
}

export interface TradingPairConfig {
  primary_api: string;
  backup_api?: string;
  exchange: string;
  description?: string;
}

export interface InstanceConfig {
  symbol: string;
  api_config: string;
  description?: string;
}

export interface ApiConfigData {
  apis: Record<string, ApiCredentials>;
  trading_pairs: Record<string, TradingPairConfig>;
  instances: Record<string, InstanceConfig>;
  metadata: {
    version: string;
    last_updated: string;
    description: string;
  };
}

export class ApiConfigManager {
  private configPath: string;
  private config: ApiConfigData;

  constructor(configPath = './config/api-config.json') {
    this.configPath = path.resolve(configPath);
    this.config = this.loadConfig();
  }

  /**
   * 加载API配置文件
   */
  private loadConfig(): ApiConfigData {
    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`配置文件不存在: ${this.configPath}`);
      }

      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configContent) as ApiConfigData;
      
      console.log(`✅ 已加载API配置文件: ${this.configPath}`);
      return config;
    } catch (error) {
      console.error(`❌ 加载API配置文件失败:`, error);
      throw error;
    }
  }

  /**
   * 根据实例名称获取API凭据
   */
  getApiCredentials(instanceName: string): ApiCredentials {
    const instanceConfig = this.config.instances[instanceName];
    if (!instanceConfig) {
      throw new Error(`未找到实例配置: ${instanceName}`);
    }

    const apiConfig = this.config.apis[instanceConfig.api_config];
    if (!apiConfig) {
      throw new Error(`未找到API配置: ${instanceConfig.api_config}`);
    }

    return apiConfig;
  }

  /**
   * 根据交易对获取API凭据
   */
  getApiCredentialsBySymbol(symbol: string): ApiCredentials {
    const pairConfig = this.config.trading_pairs[symbol];
    if (!pairConfig) {
      throw new Error(`未找到交易对配置: ${symbol}`);
    }

    const apiConfig = this.config.apis[pairConfig.primary_api];
    if (!apiConfig) {
      throw new Error(`未找到API配置: ${pairConfig.primary_api}`);
    }

    return apiConfig;
  }

  /**
   * 根据实例名称获取完整配置信息
   */
  getInstanceInfo(instanceName: string): {
    instance: InstanceConfig;
    api: ApiCredentials;
    tradingPair?: TradingPairConfig;
  } {
    const instanceConfig = this.config.instances[instanceName];
    if (!instanceConfig) {
      throw new Error(`未找到实例配置: ${instanceName}`);
    }

    const apiConfig = this.config.apis[instanceConfig.api_config];
    if (!apiConfig) {
      throw new Error(`未找到API配置: ${instanceConfig.api_config}`);
    }

    const tradingPairConfig = this.config.trading_pairs[instanceConfig.symbol];

    return {
      instance: instanceConfig,
      api: apiConfig,
      tradingPair: tradingPairConfig
    };
  }

  /**
   * 列出所有可用的实例
   */
  listInstances(): string[] {
    return Object.keys(this.config.instances);
  }

  /**
   * 列出所有API配置
   */
  listApis(): string[] {
    return Object.keys(this.config.apis);
  }

  /**
   * 验证配置文件的完整性
   */
  validateConfig(): boolean {
    try {
      // 验证实例配置
      for (const [instanceName, instanceConfig] of Object.entries(this.config.instances)) {
        if (!this.config.apis[instanceConfig.api_config]) {
          throw new Error(`实例 ${instanceName} 引用的API配置 ${instanceConfig.api_config} 不存在`);
        }

        if (!this.config.trading_pairs[instanceConfig.symbol]) {
          console.warn(`⚠️ 实例 ${instanceName} 的交易对 ${instanceConfig.symbol} 没有对应的交易对配置`);
        }
      }

      // 验证交易对配置
      for (const [symbol, pairConfig] of Object.entries(this.config.trading_pairs)) {
        if (!this.config.apis[pairConfig.primary_api]) {
          throw new Error(`交易对 ${symbol} 引用的主API配置 ${pairConfig.primary_api} 不存在`);
        }

        if (pairConfig.backup_api && !this.config.apis[pairConfig.backup_api]) {
          throw new Error(`交易对 ${symbol} 引用的备用API配置 ${pairConfig.backup_api} 不存在`);
        }
      }

      console.log('✅ API配置文件验证通过');
      return true;
    } catch (error) {
      console.error('❌ API配置文件验证失败:', error);
      return false;
    }
  }

  /**
   * 显示配置摘要
   */
  showConfigSummary(): void {
    console.log('\n📋 === API配置摘要 ===');
    console.log(`🔧 配置版本: ${this.config.metadata.version}`);
    console.log(`📅 更新时间: ${this.config.metadata.last_updated}`);
    console.log(`🔑 API数量: ${Object.keys(this.config.apis).length}`);
    console.log(`💱 交易对数量: ${Object.keys(this.config.trading_pairs).length}`);
    console.log(`🚀 实例数量: ${Object.keys(this.config.instances).length}`);
    
    console.log('\n📊 === 实例配置详情 ===');
    for (const [instanceName, instanceConfig] of Object.entries(this.config.instances)) {
      const apiConfig = this.config.apis[instanceConfig.api_config];
      if (apiConfig) {
        console.log(`🎯 ${instanceName}: ${instanceConfig.symbol} (${apiConfig.name})`);
      } else {
        console.log(`🎯 ${instanceName}: ${instanceConfig.symbol} (API配置缺失)`);
      }
    }
  }

  /**
   * 重新加载配置文件
   */
  reload(): void {
    this.config = this.loadConfig();
  }

  /**
   * 获取原始配置数据
   */
  getRawConfig(): ApiConfigData {
    return this.config;
  }
}
