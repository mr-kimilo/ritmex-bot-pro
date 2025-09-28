import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { tradingConfig } from "../config";
import { AsterExchangeAdapter } from "../exchanges/aster-adapter";
import { TrendEngine, type TrendEngineSnapshot } from "../core/trend-engine";
import { getAsterCredentials } from "../utils/api-credentials";
import { TradingDashboard, type BaseTradingSnapshot } from "./components/TradingDashboard";

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
          engineRef.current?.stop();
          setShowExitMenu(false);
          onExit();
        } else if (input === '2') {
          engineRef.current?.stop();
          console.log('\n👋 用户选择退出程序');
          setTimeout(() => {
            console.log('✅ 趋势策略安全退出，感谢使用！\n');
            process.exit(0);
          }, 500);
        } else if (key.escape) {
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
      
      // 使用防抖更新
      let updateTimeout: NodeJS.Timeout | null = null;
      const handler = (next: TrendEngineSnapshot) => {
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(() => {
          setSnapshot({ ...next, tradeLog: [...next.tradeLog] });
        }, 100);
      };
      
      engine.on("update", handler);
      engine.start();
      
      return () => {
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
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

  // 转换为通用快照格式
  const dashboardSnapshot: BaseTradingSnapshot = {
    ...snapshot,
    enhancedMode: false,
    enhanced: undefined
  };

  return <TradingDashboard snapshot={dashboardSnapshot} title="基础趋势策略" />;
}
