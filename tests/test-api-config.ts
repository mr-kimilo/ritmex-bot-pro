#!/usr/bin/env node

import { ApiConfigManager } from '../src/api-config-manager.js';
import { ApiCredentialsFactory } from '../src/api-credentials-factory.js';

/**
 * API配置系统测试脚本
 */

async function testApiConfig() {
  console.log('\n🧪 === API配置系统测试 ===\n');
  
  try {
    // 测试1: API配置管理器基本功能
    console.log('📋 测试1: API配置管理器');
    console.log('=' .repeat(40));
    
    const apiManager = new ApiConfigManager();
    
    console.log('✅ API配置管理器创建成功');
    apiManager.showConfigSummary();
    
    const isValid = apiManager.validateConfig();
    console.log(`🔍 配置验证: ${isValid ? '✅ 通过' : '❌ 失败'}`);
    
    // 测试2: 列出所有实例
    console.log('\n📋 测试2: 可用实例列表');
    console.log('=' .repeat(40));
    
    const instances = apiManager.listInstances();
    console.log(`🚀 可用实例 (${instances.length}个):`);
    instances.forEach(instance => {
      try {
        const info = apiManager.getInstanceInfo(instance);
        console.log(`  🎯 ${instance}: ${info.instance.symbol} (${info.api.name})`);
      } catch (error) {
        console.log(`  ❌ ${instance}: 配置错误`);
      }
    });
    
    // 测试3: API凭据工厂
    console.log('\n📋 测试3: API凭据工厂');
    console.log('=' .repeat(40));
    
    const credentialsFactory = new ApiCredentialsFactory();
    
    // 测试每个实例的凭据创建
    for (const instanceName of instances) {
      console.log(`\n🔧 测试实例: ${instanceName}`);
      try {
        const credentials = credentialsFactory.createAsterCredentials(instanceName);
        console.log(`  ✅ API Key: ${credentials.apiKey ? `${credentials.apiKey.slice(0, 8)}...` : '未配置'}`);
        console.log(`  ✅ API Secret: ${credentials.apiSecret ? '已配置' : '未配置'}`);
        console.log(`  ✅ Symbol: ${credentials.symbol || '未指定'}`);
      } catch (error) {
        console.log(`  ❌ 创建凭据失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // 测试4: 根据交易对获取凭据
    console.log('\n📋 测试4: 根据交易对获取凭据');
    console.log('=' .repeat(40));
    
    const symbols = ['SOLUSDT', 'ASTERUSDT'];
    for (const symbol of symbols) {
      console.log(`\n💱 测试交易对: ${symbol}`);
      try {
        const credentials = credentialsFactory.createCredentialsBySymbol(symbol);
        console.log(`  ✅ API Key: ${credentials.apiKey ? `${credentials.apiKey.slice(0, 8)}...` : '未配置'}`);
        console.log(`  ✅ Symbol: ${credentials.symbol}`);
      } catch (error) {
        console.log(`  ❌ 获取失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    console.log('\n🎉 API配置系统测试完成!');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error('可能的原因:');
    console.error('  1. api-config.json 文件不存在');
    console.error('  2. JSON格式错误');
    console.error('  3. 配置文件路径不正确');
  }
}

// 启动测试
testApiConfig().catch(console.error);
