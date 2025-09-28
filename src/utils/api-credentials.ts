import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * API凭证加载器
 * 从api-credentials文件加载API凭证
 */
export class ApiCredentialsLoader {
  private static credentials: Record<string, string> = {};
  private static loaded = false;

  /**
   * 加载API凭证文件
   */
  private static loadCredentials(): void {
    if (this.loaded) return;

    const credentialsPath = join(process.cwd(), 'config', 'api-credentials');
    
    if (!existsSync(credentialsPath)) {
      throw new Error('API凭证文件不存在: config/api-credentials');
    }

    try {
      const content = readFileSync(credentialsPath, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        // 跳过注释和空行
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          this.credentials[key.trim()] = value;
        }
      }
      
      this.loaded = true;
    } catch (error) {
      throw new Error(`加载API凭证文件失败: ${error}`);
    }
  }

  /**
   * 获取API凭证
   */
  public static getCredential(key: string): string | undefined {
    this.loadCredentials();
    return this.credentials[key];
  }

  /**
   * 获取必需的API凭证，如果不存在则抛出错误
   */
  public static requireCredential(key: string): string {
    const value = this.getCredential(key);
    if (!value) {
      throw new Error(`Missing required API credential: ${key}`);
    }
    return value;
  }

  /**
   * 获取所有凭证（调试用）
   */
  public static getAllCredentials(): Record<string, string> {
    this.loadCredentials();
    return { ...this.credentials };
  }

  /**
   * 重新加载凭证（用于热更新）
   */
  public static reload(): void {
    this.loaded = false;
    this.credentials = {};
    this.loadCredentials();
  }
}

/**
 * 便捷函数：获取ASTER API Key
 */
export function getAsterApiKey(): string {
  return ApiCredentialsLoader.requireCredential('ASTER_API_KEY');
}

/**
 * 便捷函数：获取ASTER API Secret
 */
export function getAsterApiSecret(): string {
  return ApiCredentialsLoader.requireCredential('ASTER_API_SECRET');
}

/**
 * 便捷函数：获取ASTER API凭证对
 */
export function getAsterCredentials(): { apiKey: string; apiSecret: string } {
  return {
    apiKey: getAsterApiKey(),
    apiSecret: getAsterApiSecret()
  };
}
