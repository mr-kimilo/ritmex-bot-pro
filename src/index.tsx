import "dotenv/config";
import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { logger } from "./utils/logger";
import { tradingConfig } from "./config";

console.log('🚀 RITMEX-BOT-PRO交易机器人启动中...');
console.log(`📝 日志文件: ${logger.getLogFile()}`);

// 输出重要配置信息
console.log('⚙️ 配置加载完成');
console.log(`📊 交易对: ${tradingConfig.symbol}`);
console.log(`💰 交易数量: ${tradingConfig.tradeAmount}`);

if (tradingConfig.enableDynamicRisk) {
  console.log('🎯 动态风险管理已启用 - 静态风险参数将被忽略');
  console.log(`📈 基础风险: ${(tradingConfig.riskPercentage * 100).toFixed(2)}%`);
  console.log(`🎯 目标收益: ${(tradingConfig.profitTargetPercentage * 100).toFixed(2)}%`);
} else {
  console.log('📊 使用静态风险管理参数');
}

// 直接检查环境变量
const enableGreedy = process.env.ENABLE_GREEDY_TAKE_PROFIT === 'true';
if (enableGreedy) {
  console.log('🎯 贪婪止盈已启用');
  const sampleSize = process.env.GREEDY_SAMPLE_SIZE || '10';
  const extraTarget = parseFloat(process.env.GREEDY_EXTRA_PROFIT_TARGET || '0.005') * 100;
  console.log(`📊 采样大小: ${sampleSize}`);
  console.log(`⚡ 额外收益目标: ${extraTarget.toFixed(1)}%`);
} else {
  console.log('📊 标准止盈模式');
}

console.log('🔄 开始连接交易所...');
const gracefulShutdown = (signal?: string) => {
  console.log(`\n🔄 接收到${signal || '退出'}信号，正在安全退出...`);
  
  // 先卸载React组件
  if ((global as any).unmountApp) {
    try {
      (global as any).unmountApp();
    } catch (err) {
      // 忽略卸载错误
    }
  }
  
  console.log('✅ 应用组件已清理');
  
  // 关闭日志系统
  logger.close();
  
  // 给用户一些时间看到退出信息
  setTimeout(() => {
    console.log('✅ 安全退出完成，感谢使用！');
    console.log(''); // 空行便于阅读
    process.exit(0);
  }, 1500); // 增加到1.5秒
};

// 监听退出信号
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  logger.close(); // 确保日志被写入
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  logger.close(); // 确保日志被写入
  gracefulShutdown();
});

const { rerender, unmount } = render(<App />);

// 保存卸载函数到全局，以便在退出时调用
(global as any).unmountApp = unmount;
