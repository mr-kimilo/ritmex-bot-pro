import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { formatNumber } from '../../utils/format';

// 通用的快照接口
export interface BaseTradingSnapshot {
  ready: boolean;
  symbol: string;
  lastPrice: number | null;
  sma30?: number | null;
  trend: string;
  position: {
    positionAmt: number;
    entryPrice: number;
    unrealizedProfit: number;
  };
  pnl: number;
  totalProfit: number;
  totalTrades: number;
  sessionVolume: number;
  tradeLog: Array<{
    time: string;
    type: string;
    detail: string;
  }>;
  openOrders: Array<{
    orderId: number;
    side: string;
    type: string;
    price: string;
    origQty: string;
    executedQty: string;
    status: string;
  }>;
  feeStats: {
    totalFee: number;
    dailyFee: number;
    dailyFeePercent: number;
    hourlyFeePercent: number;
    tradeCount: number;
    avgFeeRate: number;
    isWarning: boolean;
    shouldStop: boolean;
    feeEfficiency: number;
  };
  currentRiskParams?: {
    lossLimit: number;
    trailingProfit: number;
    profitLockTrigger: number;
    profitLockOffset: number;
    isDynamic: boolean;
  };
  // 增强模式特有字段
  enhancedMode?: boolean;
  enhanced?: {
    enabled: boolean;
    lastAnalysis?: any;
    lastSignal?: string;
    confidenceThreshold?: number;
    feeProtection?: any;
  };
}

interface DashboardState {
  feeStats: any;
  riskParams: any;
  orders: any[];
  recentEvents: any[];
  performance: any;
  enhanced: any;
  basicInfo: {
    symbol: string;
    lastPrice: number | null;
    sma30: number | null;
    trend: string;
    ready: boolean;
  };
  lastUpdated: {
    feeStats: number;
    riskParams: number;
    orders: number;
    recentEvents: number;
    performance: number;
    enhanced: number;
    basicInfo: number;
  };
}

interface TradingDashboardProps {
  snapshot: BaseTradingSnapshot;
  title?: string;
}

export function TradingDashboard({ snapshot, title = "Trading Dashboard" }: TradingDashboardProps) {
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    feeStats: snapshot.feeStats,
    riskParams: snapshot.currentRiskParams,
    orders: snapshot.openOrders,
    recentEvents: snapshot.tradeLog.slice(-5),
    performance: {
      totalProfit: snapshot.totalProfit,
      totalTrades: snapshot.totalTrades,
      sessionVolume: snapshot.sessionVolume
    },
    enhanced: snapshot.enhanced,
    basicInfo: {
      symbol: snapshot.symbol,
      lastPrice: snapshot.lastPrice,
      sma30: snapshot.sma30 || null,
      trend: snapshot.trend,
      ready: snapshot.ready
    },
    lastUpdated: {
      feeStats: Date.now(),
      riskParams: Date.now(),
      orders: Date.now(),
      recentEvents: Date.now(),
      performance: Date.now(),
      enhanced: Date.now(),
      basicInfo: Date.now()
    }
  });

  // 智能更新检查
  useEffect(() => {
    const now = Date.now();
    const newState = { ...dashboardState };
    let shouldUpdate = false;

    // 手续费区域更新检查
    if (hasChanged(snapshot.feeStats, dashboardState.feeStats) || 
        now - dashboardState.lastUpdated.feeStats > 30000) {
      newState.feeStats = snapshot.feeStats;
      newState.lastUpdated.feeStats = now;
      shouldUpdate = true;
    }

    // 风险参数区域更新检查
    if (hasChanged(snapshot.currentRiskParams, dashboardState.riskParams) || 
        now - dashboardState.lastUpdated.riskParams > 60000) {
      newState.riskParams = snapshot.currentRiskParams;
      newState.lastUpdated.riskParams = now;
      shouldUpdate = true;
    }

    // 订单区域更新检查
    if (ordersChanged(snapshot.openOrders, dashboardState.orders)) {
      newState.orders = snapshot.openOrders;
      newState.lastUpdated.orders = now;
      shouldUpdate = true;
    }

    // 事件区域更新检查
    if (snapshot.tradeLog.length !== dashboardState.recentEvents.length) {
      newState.recentEvents = snapshot.tradeLog.slice(-5);
      newState.lastUpdated.recentEvents = now;
      shouldUpdate = true;
    }

    // 性能指标区域更新检查
    const currentPerformance = {
      totalProfit: snapshot.totalProfit,
      totalTrades: snapshot.totalTrades,
      sessionVolume: snapshot.sessionVolume
    };
    if (hasChanged(currentPerformance, dashboardState.performance) ||
        now - dashboardState.lastUpdated.performance > 60000) {
      newState.performance = currentPerformance;
      newState.lastUpdated.performance = now;
      shouldUpdate = true;
    }

    // 基本信息区域更新检查（价格、SMA30等变化频繁的数据）
    const currentBasicInfo = {
      symbol: snapshot.symbol,
      lastPrice: snapshot.lastPrice,
      sma30: snapshot.sma30 || null,
      trend: snapshot.trend,
      ready: snapshot.ready
    };
    if (hasChanged(currentBasicInfo, dashboardState.basicInfo) ||
        now - dashboardState.lastUpdated.basicInfo > 2000) { // 2秒更新一次
      newState.basicInfo = currentBasicInfo;
      newState.lastUpdated.basicInfo = now;
      shouldUpdate = true;
    }

    // 增强模式区域更新检查
    if (snapshot.enhanced && 
        (hasChanged(snapshot.enhanced, dashboardState.enhanced) ||
         now - dashboardState.lastUpdated.enhanced > 45000)) {
      newState.enhanced = snapshot.enhanced;
      newState.lastUpdated.enhanced = now;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      setDashboardState(newState);
    }
  }, [snapshot]);

  return (
    <Box flexDirection="column" width="100%">
      {/* 顶部状态栏 */}
      <HeaderPanel 
        basicInfo={dashboardState.basicInfo} 
        title={title} 
        enhancedMode={snapshot.enhancedMode} 
      />

      <Box flexDirection="row" width="100%">
        {/* 左侧列 */}
        <Box flexDirection="column" width="50%" paddingRight={1}>
          <FeeStatsPanel 
            feeStats={dashboardState.feeStats} 
            lastUpdated={dashboardState.lastUpdated.feeStats} 
          />
          
          {snapshot.currentRiskParams && (
            <RiskManagementPanel 
              riskParams={dashboardState.riskParams} 
              position={snapshot.position}
              lastUpdated={dashboardState.lastUpdated.riskParams} 
            />
          )}

          {snapshot.enhancedMode && snapshot.enhanced && (
            <EnhancedModePanel
              enhanced={dashboardState.enhanced}
              lastUpdated={dashboardState.lastUpdated.enhanced}
            />
          )}
        </Box>

        {/* 右侧列 */}
        <Box flexDirection="column" width="50%" paddingLeft={1}>
          <OrdersPanel 
            orders={dashboardState.orders} 
            lastUpdated={dashboardState.lastUpdated.orders} 
          />
          
          <RecentEventsPanel 
            events={dashboardState.recentEvents} 
            lastUpdated={dashboardState.lastUpdated.recentEvents} 
          />
        </Box>
      </Box>

      {/* 底部性能指标 */}
      <PerformancePanel 
        performance={dashboardState.performance} 
        position={snapshot.position}
        lastUpdated={dashboardState.lastUpdated.performance} 
      />
    </Box>
  );
}

// 顶部状态栏
function HeaderPanel({ basicInfo, title, enhancedMode }: { 
  basicInfo: {
    symbol: string;
    lastPrice: number | null;
    sma30: number | null;
    trend: string;
    ready: boolean;
  }; 
  title: string;
  enhancedMode?: boolean;
}) {
  const statusColor = basicInfo.ready ? "green" : "yellow";
  const statusText = basicInfo.ready ? "运行中" : "等待数据";
  
  return (
    <Box borderStyle="single" borderColor="blue" paddingX={1} marginBottom={1}>
      <Box flexDirection="column">
        <Text color="cyan">
          🚀 {title}
        </Text>
        <Text>
          💹 交易对: <Text color="white">{basicInfo.symbol || 'N/A'}</Text> | 
          💰 当前价格: <Text color="yellow">${formatNumber(basicInfo.lastPrice, 4)}</Text> | 
          📈 SMA30: <Text color="cyan">${formatNumber(basicInfo.sma30, 4)}</Text> | 
          📊 趋势: <Text color={getTrendColor(basicInfo.trend)}>{basicInfo.trend || 'N/A'}</Text>
        </Text>
        <Text color="gray">
          🔄 状态: <Text color={statusColor}>{statusText}</Text>
          {enhancedMode && <Text color="magenta"> | 🔮 增强模式启用</Text>}
          {' | 按 q/ESC 返回'}
        </Text>
      </Box>
    </Box>
  );
}

// 手续费监控面板
function FeeStatsPanel({ feeStats, lastUpdated }: { feeStats: any; lastUpdated: number }) {
  if (!feeStats) return null;

  return (
    <Box borderStyle="single" borderColor="yellow" paddingX={1} marginBottom={1}>
      <Box flexDirection="column">
        <Text color="yellow">💰 手续费监控</Text>
        <Box flexDirection="row">
          <Box flexDirection="column" width="50%">
            <Text>
              今日: <Text color={feeStats.isWarning ? "red" : "green"}>
                ${feeStats.dailyFee?.toFixed(4)} ({feeStats.dailyFeePercent?.toFixed(2)}%)
              </Text>
            </Text>
            <Text>
              累计: <Text color="cyan">${feeStats.totalFee?.toFixed(4)}</Text>
            </Text>
          </Box>
          <Box flexDirection="column" width="50%">
            <Text>
              每小时: {feeStats.hourlyFeePercent?.toFixed(3)}%
            </Text>
            <Text>
              笔数: {feeStats.tradeCount} | 效率: ${feeStats.feeEfficiency?.toFixed(4)}
            </Text>
          </Box>
        </Box>
        {feeStats.shouldStop && (
          <Text color="red">🚨 手续费超限!</Text>
        )}
        <Text color="gray" dimColor>
          更新: {new Date(lastUpdated).toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
}

// 动态风险管理面板
function RiskManagementPanel({ riskParams, position, lastUpdated }: { 
  riskParams: any; 
  position: any; 
  lastUpdated: number; 
}) {
  if (!riskParams) return null;

  const hasPosition = Math.abs(position?.positionAmt || 0) > 1e-5;
  
  return (
    <Box borderStyle="single" borderColor="red" paddingX={1} marginBottom={1}>
      <Box flexDirection="column">
        <Text color="red">
          ⚡ {riskParams.isDynamic ? '动态风险管理' : '静态风险管理'}
        </Text>
        <Box flexDirection="row">
          <Box flexDirection="column" width="50%">
            <Text>止损: ${riskParams.lossLimit?.toFixed(2)}</Text>
            <Text>止盈: ${riskParams.trailingProfit?.toFixed(2)}</Text>
          </Box>
          <Box flexDirection="column" width="50%">
            <Text>保护: ${riskParams.profitLockTrigger?.toFixed(2)}</Text>
            <Text>偏移: ${riskParams.profitLockOffset?.toFixed(2)}</Text>
          </Box>
        </Box>
        <Text>
          持仓: {hasPosition ? 
            <Text color={position.positionAmt > 0 ? "green" : "red"}>
              {position.positionAmt > 0 ? '多' : '空'} {Math.abs(position.positionAmt).toFixed(4)}
            </Text> : 
            <Text color="gray">无仓位</Text>
          }
        </Text>
        <Text color="gray" dimColor>
          更新: {new Date(lastUpdated).toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
}

// 增强模式面板
function EnhancedModePanel({ enhanced, lastUpdated }: { enhanced: any; lastUpdated: number }) {
  if (!enhanced) return null;

  return (
    <Box borderStyle="single" borderColor="magenta" paddingX={1} marginBottom={1}>
      <Box flexDirection="column">
        <Text color="magenta">🔮 增强模式分析</Text>
        <Text>
          信号: <Text color="cyan">{enhanced.lastSignal || 'N/A'}</Text>
        </Text>
        <Text>
          置信度: <Text color="yellow">
            {enhanced.lastAnalysis?.confidence ? 
              `${(enhanced.lastAnalysis.confidence * 100).toFixed(1)}%` : 'N/A'}
          </Text>
        </Text>
        <Text>
          阈值: <Text color="gray">
            {enhanced.confidenceThreshold ? 
              `${(enhanced.confidenceThreshold * 100).toFixed(1)}%` : 'N/A'}
          </Text>
        </Text>
        <Text color="gray" dimColor>
          更新: {new Date(lastUpdated).toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
}

// 挂单面板
function OrdersPanel({ orders, lastUpdated }: { orders: any[]; lastUpdated: number }) {
  return (
    <Box borderStyle="single" borderColor="green" paddingX={1} marginBottom={1}>
      <Box flexDirection="column">
        <Text color="green">📋 挂单状态 ({orders.length})</Text>
        {orders.length > 0 ? (
          orders.slice(0, 4).map((order, index) => (
            <Text key={order.orderId}>
              <Text color={order.side === 'BUY' ? 'green' : 'red'}>{order.side}</Text> {order.origQty} @${order.price} 
              <Text color="gray"> [{order.status}]</Text>
            </Text>
          ))
        ) : (
          <Text color="gray">暂无挂单</Text>
        )}
        {orders.length > 4 && (
          <Text color="gray">...还有 {orders.length - 4} 个订单</Text>
        )}
        <Text color="gray" dimColor>
          更新: {new Date(lastUpdated).toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
}

// 最近事件面板
function RecentEventsPanel({ events, lastUpdated }: { events: any[]; lastUpdated: number }) {
  return (
    <Box borderStyle="single" borderColor="blue" paddingX={1} marginBottom={1}>
      <Box flexDirection="column">
        <Text color="blue">📊 最近事件</Text>
        {events.length > 0 ? (
          events.map((event, index) => {
            const eventText = typeof event === 'string' ? event : event.detail;
            const eventType = typeof event === 'string' ? 'info' : event.type;
            const displayText = eventText.length > 35 ? eventText.substring(0, 35) + '...' : eventText;
            
            return (
              <Text key={index} color={getEventColor(eventType, eventText)}>
                [{typeof event === 'string' ? '?' : event.time}] {displayText}
              </Text>
            );
          })
        ) : (
          <Text color="gray">暂无事件</Text>
        )}
        <Text color="gray" dimColor>
          更新: {new Date(lastUpdated).toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
}

// 性能指标面板
function PerformancePanel({ performance, position, lastUpdated }: { 
  performance: any; 
  position: any; 
  lastUpdated: number; 
}) {
  const profitColor = performance.totalProfit > 0 ? 'green' : performance.totalProfit < 0 ? 'red' : 'gray';
  const successRate = performance.totalTrades > 0 ? 
    ((performance.totalProfit > 0 ? 1 : 0) * 100).toFixed(1) : '0';

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          <Text color="cyan">📈 总盈亏: </Text>
          <Text color={profitColor}>${performance.totalProfit?.toFixed(4)}</Text>
          <Text color="cyan"> | 交易: {performance.totalTrades}</Text>
          <Text color="cyan"> | 成功率: {successRate}%</Text>
          <Text color="cyan"> | 成交量: ${formatNumber(performance.sessionVolume, 2)}</Text>
        </Box>
        <Text color="gray" dimColor>
          更新: {new Date(lastUpdated).toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
}

// 辅助函数
function hasChanged(obj1: any, obj2: any): boolean {
  return JSON.stringify(obj1) !== JSON.stringify(obj2);
}

function ordersChanged(orders1: any[], orders2: any[]): boolean {
  if (orders1.length !== orders2.length) return true;
  
  const summary1 = orders1.map(o => ({ id: o.orderId, status: o.status }));
  const summary2 = orders2.map(o => ({ id: o.orderId, status: o.status }));
  
  return JSON.stringify(summary1) !== JSON.stringify(summary2);
}

function getTrendColor(trend: string): string {
  if (trend.includes('多') || trend.includes('涨')) return 'green';
  if (trend.includes('空') || trend.includes('跌')) return 'red';
  return 'yellow';
}

function getEventColor(type: string, detail: string): string {
  if (detail.includes('盈利') || detail.includes('止盈') || type === 'close' && detail.includes('💰')) return 'green';
  if (detail.includes('亏损') || detail.includes('止损')) return 'red';
  if (detail.includes('开仓') || type === 'open') return 'cyan';
  if (detail.includes('警告') || type === 'warning') return 'yellow';
  if (detail.includes('错误') || type === 'error') return 'red';
  return 'white';
}
