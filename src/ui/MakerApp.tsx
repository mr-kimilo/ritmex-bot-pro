import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { makerConfig } from "../config";
import { AsterExchangeAdapter } from "../exchanges/aster-adapter";
import { MakerEngine, type MakerEngineSnapshot } from "../core/maker-engine";
import { DataTable, type TableColumn } from "./components/DataTable";
import { formatNumber } from "../utils/format";
import { getAsterCredentials } from "../utils/api-credentials";

interface MakerAppProps {
  onExit: () => void;
}

function useInputSupported() {
  const { isRawModeSupported } = useStdin();
  return Boolean(isRawModeSupported);
}

export function MakerApp({ onExit }: MakerAppProps) {
  const inputSupported = useInputSupported();
  const [snapshot, setSnapshot] = useState<MakerEngineSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [showExitMenu, setShowExitMenu] = useState(false);
  const engineRef = useRef<MakerEngine | null>(null);

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
            console.log('✅ 做市策略安全退出，感谢使用！\n');
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
        symbol: makerConfig.symbol,
      });
      const engine = new MakerEngine(makerConfig, adapter);
      engineRef.current = engine;
      setSnapshot(engine.getSnapshot());
      const handler = (next: MakerEngineSnapshot) => {
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
        <Text>正在初始化做市策略…</Text>
      </Box>
    );
  }

  const topBid = snapshot.topBid;
  const topAsk = snapshot.topAsk;
  const spreadDisplay = snapshot.spread != null ? `${snapshot.spread.toFixed(4)} USDT` : "-";
  const hasPosition = Math.abs(snapshot.position.positionAmt) > 1e-5;
  const sortedOrders = [...snapshot.openOrders].sort((a, b) => (Number(b.updateTime ?? 0) - Number(a.updateTime ?? 0)) || Number(b.orderId) - Number(a.orderId));
  const openOrderRows = sortedOrders.slice(0, 8).map((order) => ({
    id: order.orderId,
    side: order.side,
    price: order.price,
    qty: order.origQty,
    filled: order.executedQty,
    reduceOnly: order.reduceOnly ? "yes" : "no",
    status: order.status,
  }));
  const openOrderColumns: TableColumn[] = [
    { key: "id", header: "ID", align: "right", minWidth: 6 },
    { key: "side", header: "Side", minWidth: 4 },
    { key: "price", header: "Price", align: "right", minWidth: 10 },
    { key: "qty", header: "Qty", align: "right", minWidth: 8 },
    { key: "filled", header: "Filled", align: "right", minWidth: 8 },
    { key: "reduceOnly", header: "RO", minWidth: 4 },
    { key: "status", header: "Status", minWidth: 10 },
  ];

  const desiredRows = snapshot.desiredOrders.map((order, index) => ({
    index: index + 1,
    side: order.side,
    price: order.price,
    amount: order.amount,
    reduceOnly: order.reduceOnly ? "yes" : "no",
  }));
  const desiredColumns: TableColumn[] = [
    { key: "index", header: "#", align: "right", minWidth: 2 },
    { key: "side", header: "Side", minWidth: 4 },
    { key: "price", header: "Price", align: "right", minWidth: 10 },
    { key: "amount", header: "Qty", align: "right", minWidth: 8 },
    { key: "reduceOnly", header: "RO", minWidth: 4 },
  ];

  const lastLogs = snapshot.tradeLog.slice(-5);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyanBright">Maker Strategy Dashboard</Text>
        <Text>
          交易对: {snapshot.symbol} ｜ 买一价: {formatNumber(topBid, 2)} ｜ 卖一价: {formatNumber(topAsk, 2)} ｜ 点差: {spreadDisplay}
        </Text>
        <Text color="gray">状态: {snapshot.ready ? "实时运行" : "等待市场数据"} ｜ 按 Esc 返回策略选择</Text>
      </Box>

      <Box flexDirection="row" marginBottom={1}>
        <Box flexDirection="column" marginRight={4}>
          <Text color="greenBright">持仓</Text>
          {hasPosition ? (
            <>
              <Text>
                方向: {snapshot.position.positionAmt > 0 ? "多" : "空"} ｜ 数量: {formatNumber(Math.abs(snapshot.position.positionAmt), 4)} ｜ 开仓价: {formatNumber(snapshot.position.entryPrice, 2)}
              </Text>
              <Text>
                浮动盈亏: <Text color={snapshot.pnl >= 0 ? "green" : "red"}>{formatNumber(snapshot.pnl, 4)} USDT</Text> ｜ 账户未实现: {formatNumber(snapshot.accountUnrealized, 4)} USDT
              </Text>
              <Text color="gray">
                止损线: -{formatNumber(makerConfig.lossLimit, 2)} USDT ｜ 止盈线: +{formatNumber(makerConfig.profitTarget, 2)} USDT
              </Text>
            </>
          ) : (
            <Text color="gray">当前无持仓</Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text color="greenBright">目标挂单</Text>
          {desiredRows.length > 0 ? (
            <DataTable columns={desiredColumns} rows={desiredRows} />
          ) : (
            <Text color="gray">暂无目标挂单</Text>
          )}
          <Text>
            累计成交量: {formatNumber(snapshot.sessionVolume, 2)} USDT
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color="yellow">当前挂单</Text>
        {openOrderRows.length > 0 ? (
          <DataTable columns={openOrderColumns} rows={openOrderRows} />
        ) : (
          <Text color="gray">暂无挂单</Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color="yellow">最近事件</Text>
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
