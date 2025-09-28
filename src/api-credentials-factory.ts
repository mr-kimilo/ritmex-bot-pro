import { ApiConfigManager, type ApiCredentials } from './api-config-manager.ts';
import type { AsterCredentials } from './exchanges/aster-adapter.ts';

export class ApiCredentialsFactory {
  private apiConfigManager: ApiConfigManager;

  constructor() {
    this.apiConfigManager = new ApiConfigManager();
  }

  /**
   * 根据实例名称创建ASTER适配器凭据
   */
  createAsterCredentials(instanceName: string, symbol?: string): AsterCredentials {
    try {
      const apiCredentials = this.apiConfigManager.getApiCredentials(instanceName);
      
      console.log(`🔑 使用API配置: ${apiCredentials.name}`);
      
      return {
        apiKey: apiCredentials.apiKey,
        apiSecret: apiCredentials.apiSecret,
        symbol: symbol
      };
    } catch (error) {
      console.warn(`⚠️ 无法从API配置获取 ${instanceName} 凭据，回退到环境变量`);
      console.warn(`错误: ${error instanceof Error ? error.message : String(error)}`);
      
      // 回退到环境变量
      return {
        apiKey: process.env.ASTER_API_KEY,
        apiSecret: process.env.ASTER_API_SECRET,
        symbol: symbol
      };
    }
  }

  /**
   * 根据交易对创建凭据
   */
  createCredentialsBySymbol(symbol: string): AsterCredentials {
    try {
      const apiCredentials = this.apiConfigManager.getApiCredentialsBySymbol(symbol);
      
      console.log(`🔑 ${symbol} 使用API配置: ${apiCredentials.name}`);
      
      return {
        apiKey: apiCredentials.apiKey,
        apiSecret: apiCredentials.apiSecret,
        symbol: symbol
      };
    } catch (error) {
      console.warn(`⚠️ 无法从API配置获取 ${symbol} 凭据，回退到环境变量`);
      
      return {
        apiKey: process.env.ASTER_API_KEY,
        apiSecret: process.env.ASTER_API_SECRET,
        symbol: symbol
      };
    }
  }

  /**
   * 验证API配置
   */
  validateApiConfig(): boolean {
    try {
      return this.apiConfigManager.validateConfig();
    } catch (error) {
      console.error('❌ API配置验证失败:', error);
      return false;
    }
  }

  /**
   * 显示API配置摘要
   */
  showApiConfigSummary(): void {
    try {
      this.apiConfigManager.showConfigSummary();
    } catch (error) {
      console.warn('⚠️ 无法显示API配置摘要，可能是配置文件缺失');
    }
  }

  /**
   * 获取API配置管理器实例
   */
  getApiConfigManager(): ApiConfigManager {
    return this.apiConfigManager;
  }
}
