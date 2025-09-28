# 🔑 多API密钥管理系统使用指南

## 📋 概述

新的API配置系统允许不同的交易实例使用不同的API密钥，解决了"BNB有两个API，不同的API调用不同的TRADE_SYMBOL"的需求。

## 🏗️ 系统架构

### API配置文件 (`api-config.json`)
集中管理所有API密钥和实例配置：

```json
{
  "apis": {
    "bnb_primary": {
      "name": "BNB Primary API",
      "apiKey": "你的第一个BNB_API_KEY",
      "apiSecret": "你的第一个BNB_API_SECRET",
      "baseUrl": "https://api.aster-bot.com"
    },
    "bnb_secondary": {
      "name": "BNB Secondary API",
      "apiKey": "你的第二个BNB_API_KEY", 
      "apiSecret": "你的第二个BNB_API_SECRET",
      "baseUrl": "https://api.aster-bot.com"
    }
  },
  "instances": {
    "bnb-sol": {
      "symbol": "SOLUSDT",
      "api_config": "bnb_secondary"
    },
    "bnb-aster": {
      "symbol": "ASTERUSDT",
      "api_config": "bnb_primary"
    }
  }
}
```

### 实例映射关系

| 实例类型 | 交易对 | 使用的API | 配置文件 |
|---------|--------|----------|----------|
| `bnb-sol` | SOLUSDT | BNB Secondary API | `.env.bnb.sol` |
| `bnb-aster` | ASTERUSDT | BNB Primary API | `.env.bnb.aster` |
| `bnb` | ASTERUSDT | BNB Primary API | `.env.bnb` |
| `sol` | SOLUSDT | SOL Dedicated Account | `.env.sol` |

## 🛠️ 配置步骤

### 1. 修改API配置文件
编辑 `api-config.json`，将示例API密钥替换为你的真实密钥：

```bash
# 使用任何文本编辑器
notepad api-config.json
```

**重要**: 将以下示例值替换为真实值：
- `your_bnb_api_key_1` → 你的第一个BNB API密钥
- `your_bnb_api_secret_1` → 你的第一个BNB API密钥的Secret
- `your_bnb_api_key_2` → 你的第二个BNB API密钥  
- `your_bnb_api_secret_2` → 你的第二个BNB API密钥的Secret

### 2. 验证配置
运行测试脚本确认配置正确：

```bash
node --import tsx test-api-config.ts
```

应该看到类似输出：
```
✅ API配置文件验证通过
🎯 bnb-sol: SOLUSDT (BNB Secondary API)  
🎯 bnb-aster: ASTERUSDT (BNB Primary API)
```

## 🚀 启动多实例

### 同一BNB账户运行多个交易对

```bash
# 终端1: 启动SOLUSDT交易 (使用第二个API)
npm run start:bnb-sol

# 终端2: 启动ASTERUSDT交易 (使用第一个API)  
npm run start:bnb-aster
```

### 启动输出示例
```
🚀 === 启动 SOL 交易实例 ===
🔧 检测到实例类型: bnb-sol
🔑 使用API配置: BNB Secondary API
🌐 API地址: https://api.aster-bot.com
🔐 API密钥: abcd1234...
📊 交易对: SOLUSDT
💰 交易数量: 0.1
✅ SOL 实例启动成功!
```

## 🔍 监控和管理

### 检查实例状态
```bash
# Windows
.\instance-manager.bat list

# 查看特定配置
.\instance-manager.bat status bnb-sol
```

### 停止实例
```bash
# 在运行实例的终端按 Ctrl+C
# 或使用管理脚本
.\instance-manager.bat stop-all
```

## ⚡ 技术特性

### 完全隔离
- ✅ **API隔离**: 不同实例使用完全不同的API密钥
- ✅ **订单隔离**: 按交易对完全分离，不会冲突
- ✅ **Redis隔离**: 使用不同数据库(DB=3,4)存储数据
- ✅ **配置隔离**: 独立的参数文件

### 资源共享
- 🔄 **账户余额**: 两个实例共享BNB账户的USDT余额
- ⚡ **API限制**: 共享账户级别的API请求速率限制
- 📊 **持仓独立**: SOL和ASTER持仓完全独立

## 🚨 注意事项

### 1. 资金管理
确保BNB账户有足够的USDT余额支持两个实例同时交易：
- SOL实例需要: `0.1 × SOL当前价格` 的USDT
- ASTER实例需要: `50 × ASTER当前价格` 的USDT

### 2. API速率限制
两个实例共享同一账户的API请求限制，建议：
- 适当调整 `POLL_INTERVAL_MS` 避免请求过于频繁
- 监控API错误，如遇到频率限制适当增加间隔

### 3. 启动顺序
建议逐个启动实例，观察稳定后再启动下一个：
1. 先启动一个实例，确认正常工作
2. 再启动第二个实例
3. 监控账户余额和订单状态

## 🛡️ 故障排除

### 配置验证失败
```bash
# 检查JSON格式
node --import tsx test-api-config.ts

# 常见问题：
# 1. JSON格式错误（缺少逗号、括号不匹配）
# 2. API密钥包含特殊字符
# 3. 文件编码问题
```

### API密钥不工作
```bash
# 回退到环境变量模式
# 系统会自动检测并使用 .env 文件中的：
# ASTER_API_KEY
# ASTER_API_SECRET
```

### 实例启动失败
```bash
# 检查详细错误信息
npm run start:bnb-sol

# 常见问题：
# 1. API密钥无效
# 2. 网络连接问题  
# 3. 账户余额不足
```

## 📚 相关文档

- [多实例系统状态报告](./docs/multi-symbol-status-report.md)
- [Redis增强系统指南](./docs/redis-enhanced-system.md)
- [实例管理脚本使用说明](./docs/instance-management.md)

## 🎯 总结

✅ **问题解决**: 现在可以在一个BNB账号下使用两个不同的API调用不同的交易对
✅ **订单安全**: SOLUSDT和ASTERUSDT的订单完全独立，不会相互影响
✅ **系统稳定**: 通过Redis数据库分离和配置隔离确保稳定运行
✅ **易于管理**: 集中的JSON配置文件便于维护和扩展

立即开始使用：配置你的API密钥，然后运行 `npm run start:bnb-sol` 和 `npm run start:bnb-aster`！
