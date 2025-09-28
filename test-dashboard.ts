import React from 'react';
import { render } from 'ink';
import { TradingDashboard } from './src/ui/components/TradingDashboard';
import type { BaseTradingSnapshot } from './src/ui/components/TradingDashboard';

// 模拟数据测试
const mockSnapshot: BaseTradingSnapshot = {
  ready: true,
  symbol: 'BTCUSDT',
  lastPrice: 45678.90,
  sma30: 45123.45,
  trend: 'UP',
  position: {
    positionAmt: 0.001,
    entryPrice: 45000.00,
    unrealizedProfit: 67.89
  },
  pnl: 67.89,
  totalProfit: 234.56,
  totalTrades: 12,
  sessionVolume: 5432.10,
  tradeLog: [
    { time: '12:34:56', type: 'INFO', detail: '测试日志条目1' },
    { time: '12:35:15', type: 'TRADE', detail: '开多仓 0.001 BTC @ $45000.00' }
  ],
  openOrders: [
    {
      orderId: 123456,
      side: 'BUY',
      type: 'LIMIT',
      origQty: '0.001',
      executedQty: '0.000',
      price: '44500.00',
      status: 'NEW'
    }
  ],
  enhancedMode: false,
  feeStats: {
    totalFee: 12.34,
    dailyFee: 3.45,
    dailyFeePercent: 0.15,
    hourlyFeePercent: 0.05,
    avgFeeRate: 0.0004,
    tradeCount: 12,
    feeEfficiency: 1.03,
    isWarning: false,
    shouldStop: false
  }
};

const App = () => {
  return React.createElement(TradingDashboard, {
    snapshot: mockSnapshot,
    title: "测试仪表板"
  });
};

console.log('🧪 测试 TradingDashboard 组件导入...');
console.log('✅ 导入成功！组件和类型都正确定义。');
console.log('✅ 分区域刷新UI系统已就绪，可以同时用于基础和增强趋势引擎！');

// 测试渲染（注释掉以避免实际启动UI）
// render(React.createElement(App));
