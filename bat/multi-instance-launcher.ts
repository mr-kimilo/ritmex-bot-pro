#!/usr/bin/env node
import { ConfigManager } from '../src/config-manager.ts';
import { EnhancedTrendEngine } from '../src/core/enhanced-trend-engine.ts';
import { MakerEngine } from '../src/core/maker-engine.ts';
import { OffsetMakerEngine } from '../src/core/offset-maker-engine.ts';
import { AsterExchangeAdapter } from '../src/exchanges/aster-adapter.ts';
import { ApiCredentialsFactory } from '../src/api-credentials-factory.ts';
import readline from 'readline';

/**
 * 多实例启动器 - 带策略选择界面
 * 使用方法:
 * npm run start:bnb    # 启动BNB实例
 * npm run start:sol    # 启动SOL实例  
 * npm run start:bnb-sol    # 启动BNB-SOL实例
 * npm run start:bnb-aster  # 启动BNB-ASTER实例
 * npm run start:custom -- --config=.env.custom  # 自定义配置
 */

interface StrategyOption {
  id: string;
  name: string;
  description: string;
  enhanced?: boolean;
}

const STRATEGY_OPTIONS: StrategyOption[] = [
  {
    id: 'trend',
    name: '趋势跟随策略 (SMA30)',
    description: '监控均线信号，自动进出场并维护止损/止盈',
    enhanced: false
  },
  {
    id: 'enhanced-trend', 
    name: '增强趋势策略 (Redis+KDJ/RSI)',
    description: '基于Redis缓存的K线数据，使用KDJ/RSI技术指标进行智能分析',
    enhanced: true
  },
  {
    id: 'maker',
    name: '做市刷单策略',
    description: '双边挂单提供流动性，自动追价与风控止损',
    enhanced: false
  },
  {
    id: 'offset-maker',
    name: '偏移做市策略', 
    description: '根据盘口深度自动偏移挂单并在极端不平衡时撤退',
    enhanced: false
  }
];

class MultiInstanceLauncher {
  private configManager: ConfigManager;
  private apiCredentialsFactory: ApiCredentialsFactory;
  private engine?: EnhancedTrendEngine | MakerEngine | OffsetMakerEngine;
  private instanceName: string;
  private rl: readline.Interface;

  constructor(configFile?: string) {
    this.configManager = new ConfigManager(configFile);
    this.apiCredentialsFactory = new ApiCredentialsFactory();
    this.instanceName = this.configManager.getInstanceName();
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * 显示策略选择菜单
   */
  private async showStrategySelection(): Promise<StrategyOption> {
    console.log(`\n🚀 === ${this.instanceName.toUpperCase()} 交易实例 ===`);
    console.log('📋 请选择交易策略:\n');
    
    STRATEGY_OPTIONS.forEach((strategy, index) => {
      console.log(`${index + 1}. ${strategy.name}`);
      console.log(`   ${strategy.description}`);
      if (strategy.enhanced) {
        console.log(`   ⚡ 需要Redis支持`);
      }
      console.log('');
    });

    return new Promise((resolve) => {
      const askStrategy = () => {
        this.rl.question('请输入策略编号 (1-4): ', (answer) => {
          const choice = parseInt(answer.trim());
          if (choice >= 1 && choice <= STRATEGY_OPTIONS.length) {
            const selectedStrategy = STRATEGY_OPTIONS[choice - 1];
            if (selectedStrategy) {
              resolve(selectedStrategy);
            } else {
              console.log('❌ 无效的选择，请输入 1-4');
              askStrategy();
            }
          } else {
            console.log('❌ 无效的选择，请输入 1-4');
            askStrategy();
          }
        });
      };
      askStrategy();
    });
  }

  /**
   * 创建对应的交易引擎
   */
  private createEngine(strategy: StrategyOption, config: any, exchange: AsterExchangeAdapter): EnhancedTrendEngine | MakerEngine | OffsetMakerEngine {
    switch (strategy.id) {
      case 'trend':
        return new EnhancedTrendEngine(
          config,
          exchange,
          undefined, // klineConfig
          undefined, // analyzerConfig  
          false      // 禁用增强模式
        );
      
      case 'enhanced-trend':
        return new EnhancedTrendEngine(
          config,
          exchange,
          undefined, // klineConfig - 将使用默认配置
          undefined, // analyzerConfig - 将使用默认配置 
          true       // 启用增强模式
        );
      
      case 'maker':
        return new MakerEngine(config, exchange);
      
      case 'offset-maker':
        return new OffsetMakerEngine(config, exchange);
      
      default:
        throw new Error(`未知的策略类型: ${strategy.id}`);
    }
  }

  /**
   * 启动实例
   */
  async start(): Promise<void> {
    try {
      // 显示策略选择菜单
      const selectedStrategy = await this.showStrategySelection();
      console.log(`✅ 已选择策略: ${selectedStrategy.name}\n`);

      console.log(`\n🚀 === 启动 ${this.instanceName.toUpperCase()} 交易实例 ===`);
      
      // 验证基础配置
      console.log('🔍 验证基础配置...');
      if (!this.configManager.validateConfig()) {
        console.error('❌ 配置验证失败');
        this.rl.close();
        process.exit(1);
      }
      console.log('✅ 基础配置验证通过');

      // 验证API配置
      console.log('🔍 验证API配置...');
      if (!this.apiCredentialsFactory.validateApiConfig()) {
        console.warn('⚠️ API配置验证失败，将使用环境变量');
      } else {
        console.log('✅ API配置验证通过');
      }

      // 显示API配置摘要
      try {
        this.apiCredentialsFactory.showApiConfigSummary();
      } catch (error) {
        console.warn('⚠️ 无法显示API配置摘要');
      }
      
      // 显示实例配置摘要
      console.log('📋 显示实例配置...');
      this.configManager.showConfigSummary();

      // 获取配置
      console.log('📋 获取交易配置...');
      const config = this.configManager.getConfig();
      console.log(`✅ 交易配置: ${config.symbol}, 数量: ${config.tradeAmount}`);

      // 获取实例名称（用于API配置路由）
      const instanceName = this.deriveInstanceName();
      console.log(`🔧 检测到实例类型: ${instanceName}`);

      // 创建API凭据
      console.log('🔑 创建API凭据...');
      const credentials = this.apiCredentialsFactory.createAsterCredentials(instanceName, config.symbol);
      
      if (!credentials.apiKey || !credentials.apiSecret) {
        console.error('❌ API凭据缺失，请检查配置文件或环境变量');
        this.rl.close();
        process.exit(1);
      }
      console.log(`✅ API凭据创建成功: ${credentials.apiKey.slice(0, 8)}...`);

      // 创建交易所适配器
      console.log('📡 创建交易所适配器...');
      const exchange = new AsterExchangeAdapter(credentials);
      console.log(`✅ 交易所适配器创建成功: ${exchange.id}`);

      console.log('📡 连接交易所...');
      
      // 创建对应的引擎
      console.log(`⚙️ 创建 ${selectedStrategy.name}...`);
      this.engine = this.createEngine(selectedStrategy, config, exchange);
      console.log('✅ 交易引擎创建成功');

      // 关闭readline接口
      this.rl.close();

      // 设置事件监听器
      console.log('📡 设置事件监听器...');
      this.engine.on('update', (snapshot) => {
        // 可以在这里添加状态监控逻辑
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[${this.instanceName.toUpperCase()}] 状态更新:`, {
            symbol: config.symbol,
            position: snapshot.position.positionAmt,
            price: 'lastPrice' in snapshot ? snapshot.lastPrice : 'N/A'
          });
        }
      });
      console.log('✅ 事件监听器设置完成');

      // 启动引擎
      console.log(`🎯 启动 ${config.symbol} 交易引擎...`);
      this.engine.start();
      console.log('✅ 引擎启动成功');

      console.log(`✅ ${this.instanceName.toUpperCase()} 实例启动成功!`);
      console.log(`📊 交易对: ${config.symbol}`);
      console.log(`🎯 策略: ${selectedStrategy.name}`);
      console.log(`🔑 使用API: ${credentials.apiKey ? `${credentials.apiKey.slice(0, 8)}...` : '环境变量'}`);
      console.log(`💰 交易数量: ${config.tradeAmount}`);
      console.log(`🛡️ 增强模式: ${selectedStrategy.enhanced ? '启用' : '禁用'}`);
      console.log(`\n🔄 正在运行中... (Ctrl+C 停止)\n`);
      
      // 添加一个定时器来保持进程运行并显示状态
      setInterval(() => {
        const snapshot = this.engine?.getSnapshot();
        if (snapshot) {
          const price = 'lastPrice' in snapshot ? snapshot.lastPrice : 'N/A';
          console.log(`💓 ${new Date().toLocaleTimeString()} - ${snapshot.symbol} 运行中, 最新价格: ${price}`);
        }
      }, 30000); // 每30秒显示一次状态
      
    } catch (error) {
      console.error(`❌ ${this.instanceName.toUpperCase()} 实例启动失败:`, error);
      if (error instanceof Error) {
        console.error('错误堆栈:', error.stack);
      }
      this.rl.close();
      process.exit(1);
    }
  }

  /**
   * 根据配置推断实例名称
   */
  private deriveInstanceName(): string {
    // 从ConfigManager获取推断的实例名称
    try {
      const apiInfo = this.configManager.getApiCredentials();
      return apiInfo.name.toLowerCase().includes('bnb') ? 
        (this.configManager.getConfig().symbol === 'SOLUSDT' ? 'bnb-sol' : 'bnb-aster') :
        this.instanceName;
    } catch (error) {
      // 如果API配置不可用，使用传统方式推断
      return this.instanceName;
    }
  }

  /**
   * 停止实例
   */
  async stop(): Promise<void> {
    console.log(`\n🛑 停止 ${this.instanceName.toUpperCase()} 实例...`);
    
    this.rl.close();
    
    if (this.engine) {
      try {
        this.engine.stop();
        // 不同引擎可能有不同的清理方法
        if ('cleanup' in this.engine && typeof this.engine.cleanup === 'function') {
          await this.engine.cleanup();
        }
      } catch (error) {
        console.warn('⚠️ 引擎停止时出现警告:', error);
      }
    }

    console.log(`✅ ${this.instanceName.toUpperCase()} 实例已停止`);
  }

  /**
   * 获取实例状态
   */
  getStatus() {
    if (!this.engine) {
      return { status: 'stopped', instance: this.instanceName };
    }

    const snapshot = this.engine.getSnapshot();
    return {
      status: 'running',
      instance: this.instanceName,
      symbol: this.configManager.getConfig().symbol,
      position: snapshot.position.positionAmt,
      price: 'lastPrice' in snapshot ? snapshot.lastPrice : 'N/A',
      enhanced: 'enhanced' in snapshot ? snapshot.enhanced : null
    };
  }
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  let configFile = './config/.env';

  // 查找配置文件参数
  const configArg = args.find(arg => arg.startsWith('--config='));
  if (configArg) {
    const parts = configArg.split('=');
    if (parts.length > 1 && parts[1]) {
      configFile = parts[1];
    }
  }

  // 或者根据脚本名称推断
  if (process.env.npm_lifecycle_event) {
    const event = process.env.npm_lifecycle_event;
    if (event.includes(':bnb') && !event.includes('-')) {
      configFile = './config/.env.bnb';
    } else if (event.includes(':sol')) {
      configFile = './config/.env.sol';
    } else if (event.includes('bnb-sol')) {
      configFile = './config/.env.bnb.sol';
    } else if (event.includes('bnb-aster')) {
      configFile = './config/.env.bnb.aster';
    }
  }

  return { configFile };
}

// 主启动逻辑
async function main() {
  console.log('🔍 === 多实例启动器开始执行 ===');
  console.log(`进程参数: ${process.argv.join(' ')}`);
  console.log(`环境变量 npm_lifecycle_event: ${process.env.npm_lifecycle_event}`);
  
  const { configFile } = parseArgs();
  console.log(`📁 解析到配置文件: ${configFile}`);
  
  console.log('⚙️ 创建启动器实例...');
  const launcher = new MultiInstanceLauncher(configFile);
  console.log('✅ 启动器实例创建成功');

  // 处理退出信号
  process.on('SIGINT', async () => {
    console.log('\n📋 接收到停止信号...');
    await launcher.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n📋 接收到终止信号...');
    await launcher.stop();
    process.exit(0);
  });

  // 未捕获异常处理
  process.on('uncaughtException', (error) => {
    console.error('💥 未捕获异常:', error);
    launcher.stop().then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的Promise拒绝:', reason);
    launcher.stop().then(() => process.exit(1));
  });

  // 启动实例
  console.log('🚀 准备启动实例...');
  await launcher.start();
  console.log('✅ 启动过程完成');
}

// 直接执行main函数，不进行复杂的文件检查
console.log('🔍 启动多实例启动器...');
console.log(`   当前文件: ${import.meta.url}`);
console.log(`   进程参数: ${process.argv.join(' ')}`);

main().catch(error => {
  console.error('❌ main函数执行失败:', error);
  if (error instanceof Error) {
    console.error('错误堆栈:', error.stack);
  }
  process.exit(1);
});

export { MultiInstanceLauncher };
