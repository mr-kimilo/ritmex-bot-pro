import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { tradingConfig } from "../config";
import { AsterExchangeAdapter } from "../exchanges/aster-adapter";
import { TrendEngine, type TrendEngineSnapshot } from "../core/trend-engine";
import { formatNumber } from "../utils/format";
import { DataTable, type TableColumn } from "./components/DataTable";
import { getAsterCredentials } from "../utils/api-credentials";

const READY_MESSAGE = "正在等待交易所推送数据…";

interface TrendAppProps {
  onExit: () => void;
}

function useInputSupported() {
  const { isRawModeSupported } = useStdin();
  return Boolean(isRawModeSupported);
}

export function TrendApp({ onExit }: TrendAppProps) {
  const inputSupported = useInputSupported();
  const [snapshot, setSnapshot] = useState<TrendEngineSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [showExitMenu, setShowExitMenu] = useState(false);
  const engineRef = useRef<TrendEngine | null>(null);

  useInput(
    (input, key) => {
      if (showExitMenu) {
        if (input === '1') {
          // 返回主菜单
          engineRef.current?.stop();
          setShowExitMenu(false);
          onExit();
        } else if (input === '2') {
          // 退出程序
          engineRef.current?.stop();
          console.log('\n👋 用户选择退出程序');
          setTimeout(() => {
            console.log('✅ 趋势策略安全退出，感谢使用！\n');
            process.exit(0);
          }, 500);
        } else if (key.escape) {
          // 取消退出菜单
          setShowExitMenu(false);
        }
        return;
      }
      
      if (key.escape) {
        setShowExitMenu(true);
      }
    },
    { isActive: inputSupported }
  );

  useEffect(() => {
    try {
      const { apiKey, apiSecret } = getAsterCredentials();
      const adapter = new AsterExchangeAdapter({
        apiKey,
        apiSecret,
        symbol: tradingConfig.symbol,
      });
      const engine = new TrendEngine(tradingConfig, adapter);
      engineRef.current = engine;
      setSnapshot(engine.getSnapshot());
      const handler = (next: TrendEngineSnapshot) => {
        setSnapshot({ ...next, tradeLog: [...next.tradeLog] });
      };
      engine.on("update", handler);
      engine.start();
      return () => {
        engine.off("update", handler);
        engine.stop();
      };
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  if (showExitMenu) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">⚠️ 退出选项</Text>
        <Text color="gray">请选择你要进行的操作：</Text>
        <Text color="cyan">1. 返回主菜单</Text>
        <Text color="red">2. 退出程序</Text>
        <Text color="gray">按对应数字选择，ESC 取消</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">启动失败: {error.message}</Text>
        <Text color="gray">请检查环境变量和网络连通性。</Text>
      </Box>
    );
  }

  if (!snapshot) {
    return (
      <Box padding={1}>
        <Text>正在初始化趋势策略…</Text>
      </Box>
    );
  }

  const { position, tradeLog, openOrders, trend, ready, lastPrice, sma30, sessionVolume, feeStats, currentRiskParams } = snapshot;
  const hasPosition = Math.abs(position.positionAmt) > 1e-5;
  const lastLogs = tradeLog.slice(-5);
  
  const sortedOrders = [...openOrders].sort((a, b) => (Number(b.updateTime ?? 0) - Number(a.updateTime ?? 0)) || Number(b.orderId) - Number(a.orderId));
  const orderRows = sortedOrders.slice(0, 8).map((order) => ({
    id: order.orderId,
    side: order.side,
    type: order.type,
    price: order.price,
    qty: order.origQty,
    filled: order.executedQty,
    status: order.status,
  }));
  const orderColumns: TableColumn[] = [
    { key: "id", header: "ID", align: "right", minWidth: 6 },
    { key: "side", header: "Side", minWidth: 4 },
    { key: "type", header: "Type", minWidth: 10 },
    { key: "price", header: "Price", align: "right", minWidth: 10 },
    { key: "qty", header: "Qty", align: "right", minWidth: 8 },
    { key: "filled", header: "Filled", align: "right", minWidth: 8 },
    { key: "status", header: "Status", minWidth: 10 },
  ];

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyanBright">Trend Strategy Dashboard</Text>
        <Text>
          交易对: {snapshot.symbol} ｜ 最近价格: {formatNumber(lastPrice, 2)} ｜ SMA30: {formatNumber(sma30, 2)} ｜ 趋势: {trend}
        </Text>
        <Text color="gray">状态: {ready ? "实时运行" : READY_MESSAGE} ｜ 按 Esc 返回策略选择</Text>
      </Box>

      <Box flexDirection="row" marginBottom={1}>
        <Box flexDirection="column" marginRight={4}>
          <Text color="greenBright">持仓</Text>
          {hasPosition ? (
            <>
              <Text>
                方向: {position.positionAmt > 0 ? "多" : "空"} ｜ 数量: {formatNumber(Math.abs(position.positionAmt), 4)} ｜ 开仓价: {formatNumber(position.entryPrice, 2)}
              </Text>
              <Text>
                浮动盈亏: {formatNumber(snapshot.pnl, 4)} USDT ｜ 账户未实现盈亏: {formatNumber(snapshot.unrealized, 4)} USDT
              </Text>
            </>
          ) : (
            <Text color="gray">当前无持仓</Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text color="greenBright">绩效</Text>
          <Text>
            累计交易次数: {snapshot.totalTrades} ｜ 累计收益: {formatNumber(snapshot.totalProfit, 4)} USDT
          </Text>
          <Text>
            累计成交量: {formatNumber(sessionVolume, 2)} USDT
          </Text>
          {snapshot.lastOpenSignal.side ? (
            <Text color="gray">
              最近开仓信号: {snapshot.lastOpenSignal.side} @ {formatNumber(snapshot.lastOpenSignal.price, 2)}
            </Text>
          ) : null}
        </Box>
      </Box>

      {/* 手续费监控面板 */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="yellow">💰 手续费监控</Text>
        <Box flexDirection="row">
          <Box flexDirection="column" marginRight={4}>
            <Text>
              累计手续费: <Text color="cyan">${feeStats.totalFee.toFixed(4)}</Text>
            </Text>
            <Text>
              今日手续费: <Text color={feeStats.isWarning ? "red" : "green"}>
                ${feeStats.dailyFee.toFixed(4)} ({feeStats.dailyFeePercent.toFixed(2)}%)
              </Text>
            </Text>
          </Box>
          <Box flexDirection="column" marginRight={4}>
            <Text>
              小时手续费: <Text color={feeStats.hourlyFeePercent > 0.3 ? "yellow" : "green"}>
                {feeStats.hourlyFeePercent.toFixed(2)}%
              </Text>
            </Text>
            <Text>
              交易笔数: <Text color="cyan">{feeStats.tradeCount}</Text>
            </Text>
          </Box>
          <Box flexDirection="column">
            <Text>
              实际费率: <Text color="cyan">{(feeStats.avgFeeRate * 100).toFixed(4)}%</Text>
            </Text>
            <Text>
              平均手续费: <Text color="cyan">${feeStats.feeEfficiency.toFixed(4)}/笔</Text>
            </Text>
          </Box>
        </Box>
        {feeStats.shouldStop && (
          <Text color="red">🚨 手续费超限，已暂停交易!</Text>
        )}
        {feeStats.isWarning && !feeStats.shouldStop && (
          <Text color="yellow">⚠️ 手续费占比较高，请注意!</Text>
        )}
      </Box>

      {/* 动态风险管理状态面板 */}
      {(process.env.ENABLE_DYNAMIC_RISK === 'true') && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta">🎯 动态风险管理 - 高频模式 ({currentRiskParams.isDynamic ? '已启用' : '等待价格数据'})</Text>
          <Box flexDirection="row">
            <Box flexDirection="column" marginRight={4}>
              <Text>
                实际止损: <Text color="red">${currentRiskParams.lossLimit.toFixed(2)}</Text>
              </Text>
              <Text>
                实际止盈: <Text color="green">${currentRiskParams.trailingProfit.toFixed(2)}</Text>
              </Text>
            </Box>
            <Box flexDirection="column" marginRight={4}>
              <Text>
                利润保护: <Text color="cyan">${currentRiskParams.profitLockTrigger.toFixed(2)}</Text>
              </Text>
              <Text>
                保护偏移: <Text color="yellow">${currentRiskParams.profitLockOffset.toFixed(2)}</Text>
              </Text>
            </Box>
            <Box flexDirection="column">
              <Text>
                当前价格: <Text color="white">${(lastPrice || 0).toFixed(3)}</Text>
              </Text>
              <Text>
                状态: <Text color={currentRiskParams.isDynamic ? "green" : "yellow"}>
                  {currentRiskParams.isDynamic ? "✓ 动态计算" : "⏳ 等待数据"}
                </Text>
              </Text>
            </Box>
          </Box>
          <Text color="gray" dimColor>
            📝 {currentRiskParams.isDynamic ? 
              `参数基于价格 $${(lastPrice || 0).toFixed(3)} 动态计算` : 
              "等待获取市场价格后开始动态计算"
            }
          </Text>
        </Box>
      )}

      {/* 高频交易状态面板 */}
      {currentRiskParams.isDynamic && (
        <Box borderStyle="single" borderColor="cyan" padding={1} marginBottom={1}>
          <Text color="cyan">⚡ 高频交易优化</Text>
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="column">
              <Text>
                敏感度: <Text color="magenta">{((parseFloat(process.env.DYNAMIC_RISK_THRESHOLD || '0.015')) * 100).toFixed(1)}%</Text>
              </Text>
              <Text>
                轮询间隔: <Text color="green">{process.env.POLL_INTERVAL_MS || '500'}ms</Text>
              </Text>
            </Box>
            <Box flexDirection="column">
              <Text>
                风险距离: <Text color="red">{((parseFloat(process.env.RISK_PERCENTAGE || '0.008')) * 100).toFixed(1)}%</Text>
              </Text>
              <Text>
                止盈距离: <Text color="green">{((parseFloat(process.env.PROFIT_TARGET_PERCENTAGE || '0.018')) * 100).toFixed(1)}%</Text>
              </Text>
            </Box>
          </Box>
          <Text color="gray" dimColor>
            🚀 优化参数: 更低阈值，更快反应，提升交易频率
          </Text>
        </Box>
      )}

      <Box flexDirection="column" marginBottom={1}>
        <Text color="yellow">当前挂单</Text>
        {orderRows.length > 0 ? (
          <DataTable columns={orderColumns} rows={orderRows} />
        ) : (
          <Text color="gray">暂无挂单</Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color="yellow">最近交易与事件</Text>
        {lastLogs.length > 0 ? (
          lastLogs.map((item, index) => (
            <Text key={`${item.time}-${index}`}>
              [{item.time}] [{item.type}] {item.detail}
            </Text>
          ))
        ) : (
          <Text color="gray">暂无日志</Text>
        )}
      </Box>
    </Box>
  );
}
