#!/usr/bin/env node

import { ConfigManager } from '../src/config-manager.js';

/**
 * 配置测试脚本
 * 使用方法:
 * node --import tsx test-config.ts .env.bnb.sol
 * node --import tsx test-config.ts .env.bnb.aster
 */

async function testConfig() {
  console.log('\n🧪 === 配置测试工具 ===\n');
  
  const configFiles = ['config/.env.bnb', 'config/.env.sol', 'config/.env.bnb.sol', 'config/.env.bnb.aster'];
  
  for (const configFile of configFiles) {
    try {
      console.log(`\n📋 测试配置文件: ${configFile}`);
      console.log('=' .repeat(50));
      
      const configManager = new ConfigManager(configFile);
      const config = configManager.getConfig();
      
      console.log(`✅ 配置加载成功`);
      console.log(`🎯 交易对: ${config.symbol}`);
      console.log(`💰 交易数量: ${config.tradeAmount}`);
      console.log(`📉 止损限制: ${(config.lossLimit * 100).toFixed(2)}%`);
      console.log(` 实例名称: ${configManager.getInstanceName()}`);
      
    } catch (error) {
      console.error(`❌ 配置文件 ${configFile} 测试失败:`, error instanceof Error ? error.message : String(error));
    }
  }
}

// 启动测试
testConfig().catch(console.error);
