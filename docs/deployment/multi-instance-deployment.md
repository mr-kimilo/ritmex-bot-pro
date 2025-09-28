# 多实例部署指南

本指南将指导您如何设置和运行多个独立的交易机器人实例，每个实例使用不同的配置文件和API凭据。

## 🎯 概述

多实例部署允许您：
- 同时交易不同的币种（如BNB和SOL）
- 使用不同的交易策略和参数
- 独立的Redis数据库避免数据冲突
- 分离的API凭据和风险管理

## 📁 文件结构

```
ritmex-bot/
├── .env.bnb              # BNB实例配置
├── .env.sol              # SOL实例配置
├── .env.custom           # 自定义实例配置（可选）
├── multi-instance-launcher.ts  # 多实例启动器
├── instance-manager.bat  # Windows管理脚本
├── instance-manager.sh   # Linux/Mac管理脚本
├── src/
│   └── config-manager.ts # 配置管理器
└── package.json          # 更新的启动脚本
```

## ⚡ 快速开始

### 1. 配置API凭据

编辑配置文件，添加您的API信息：

**BNB实例 (`.env.bnb`)**:
```bash
# 修改以下配置
ASTER_API_KEY=your_bnb_api_key
ASTER_API_SECRET=your_bnb_api_secret
ASTER_API_PASSPHRASE=your_bnb_api_passphrase
```

**SOL实例 (`.env.sol`)**:
```bash
# 修改以下配置
ASTER_API_KEY=your_sol_api_key
ASTER_API_SECRET=your_sol_api_secret
ASTER_API_PASSPHRASE=your_sol_api_passphrase
```

### 2. 启动实例

**Windows用户**:
```batch
# 启动BNB实例
instance-manager.bat start bnb

# 启动SOL实例
instance-manager.bat start sol

# 查看状态
instance-manager.bat status
```

**Linux/Mac用户**:
```bash
# 给脚本执行权限
chmod +x instance-manager.sh

# 启动BNB实例
./instance-manager.sh start bnb

# 启动SOL实例
./instance-manager.sh start sol

# 查看状态
./instance-manager.sh status
```

**或者使用npm脚本**:
```bash
# 启动BNB实例
npm run start:bnb

# 启动SOL实例
npm run start:sol
```

## 🔧 配置详解

### 基础配置对比

| 配置项 | BNB实例 | SOL实例 | 说明 |
|--------|---------|---------|------|
| 交易对 | BNBUSDT | SOLUSDT | 不同币种 |
| 交易数量 | 0.1 | 0.5 | 根据价格调整 |
| 止损限制 | 3% | 4% | SOL波动性更大 |
| 追踪止盈 | 20% | 25% | SOL设置更激进 |
| Redis数据库 | DB=1 | DB=2 | 数据隔离 |
| 置信度阈值 | 70% | 75% | SOL要求更高置信度 |

### Redis配置隔离

每个实例使用不同的Redis数据库和键前缀：

```bash
# BNB实例
REDIS_DB=1
REDIS_KEY_PREFIX=ritmex_bnb_

# SOL实例  
REDIS_DB=2
REDIS_KEY_PREFIX=ritmex_sol_
```

### 技术指标调优

不同币种使用不同的技术指标参数：

```bash
# BNB实例 - 相对保守
RSI_OVERBOUGHT=70
RSI_OVERSOLD=30
VOLUME_LOOKBACK=20

# SOL实例 - 更激进
RSI_OVERBOUGHT=75
RSI_OVERSOLD=25  
VOLUME_LOOKBACK=15
```

## 🚀 启动命令

### NPM脚本方式

```bash
# BNB实例
npm run start:bnb

# SOL实例
npm run start:sol

# 自定义配置
npm run start:custom -- --config=.env.myconfig
```

### 直接使用启动器

```bash
# 使用指定配置文件
node --import tsx multi-instance-launcher.ts --config=.env.bnb
node --import tsx multi-instance-launcher.ts --config=.env.sol
```

## 📊 监控和管理

### 查看实例状态

**Windows**:
```batch
instance-manager.bat status
```

**Linux/Mac**:
```bash
./instance-manager.sh status
```

输出示例：
```
=== 实例状态 ===
✅ BNB: 运行中 (PID: 12345)
✅ SOL: 运行中 (PID: 12346)
⭕ CUSTOM: 已停止
```

### 停止实例

```bash
# 停止BNB实例
instance-manager.bat stop bnb

# 停止SOL实例  
instance-manager.bat stop sol
```

### 重启实例

```bash
# 重启BNB实例
instance-manager.bat restart bnb
```

### 查看配置

```bash
# 列出所有配置文件
instance-manager.bat list
```

## 🛠️ 自定义实例

### 创建新实例

1. 复制现有配置文件：
```bash
cp .env.bnb .env.eth
```

2. 修改配置：
```bash
# .env.eth
INSTANCE_NAME=ETH
TRADE_SYMBOL=ETHUSDT
TRADE_AMOUNT=0.01
REDIS_DB=3
REDIS_KEY_PREFIX=ritmex_eth_
```

3. 启动实例：
```bash
npm run start:custom -- --config=.env.eth
```

## 🔍 故障排查

### 常见问题

**1. 端口冲突**
- 每个实例使用相同端口会冲突
- 解决：在配置中设置不同的端口

**2. Redis连接错误**
- 检查Redis服务是否运行
- 验证数据库编号是否冲突

**3. API凭据错误**
- 确认每个实例使用不同的API密钥
- 检查API权限设置

### 日志查看

```bash
# 查看实例日志（如果配置了日志文件）
tail -f logs/bnb.log
tail -f logs/sol.log
```

## 🔒 安全建议

### API密钥管理
- 为每个实例创建独立的API密钥
- 设置最小必需权限
- 定期轮换密钥

### 风险控制
- 每个实例设置独立的资金限额
- 监控总体仓位风险
- 设置合理的止损参数

### 监控告警
- 设置实例状态监控
- 配置异常情况告警
- 定期检查日志

## 📈 性能优化

### 资源使用
- 每个实例占用约100-200MB内存
- CPU使用率通常在5-15%之间
- 网络流量主要来自API调用

### 建议配置
- **2核4GB**：可运行2-3个实例
- **4核8GB**：可运行5-8个实例
- **8核16GB**：可运行10+个实例

## 💡 最佳实践

1. **配置管理**
   - 使用版本控制管理配置文件
   - 定期备份配置
   - 测试环境验证配置

2. **监控体系**
   - 实时监控实例状态
   - 记录关键指标
   - 设置告警机制

3. **风险管控**
   - 分散投资不同币种
   - 控制单实例仓位大小
   - 定期评估策略效果

4. **运维管理**
   - 自动化启动脚本
   - 定时健康检查
   - 日志轮转和清理

## 🎉 总结

多实例部署为您提供了：
- ✅ **灵活性**：不同币种独立配置
- ✅ **安全性**：数据和风险隔离
- ✅ **扩展性**：随时添加新实例
- ✅ **监控性**：独立状态监控

现在您可以同时运行多个交易机器人，每个专注于不同的交易品种和策略！🚀
