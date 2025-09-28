import React, { useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { TrendApp } from "./TrendApp";
import { MakerApp } from "./MakerApp";
import { OffsetMakerApp } from "./OffsetMakerApp";
import { EnhancedTrendApp } from "./EnhancedTrendApp";

interface StrategyOption {
  id: "trend" | "enhanced-trend" | "maker" | "offset-maker";
  label: string;
  description: string;
  component: React.ComponentType<{ onExit: () => void }>;
}

const STRATEGIES: StrategyOption[] = [
  {
    id: "trend",
    label: "趋势跟随策略 (SMA30)",
    description: "监控均线信号，自动进出场并维护止损/止盈",
    component: TrendApp,
  },
  {
    id: "enhanced-trend",
    label: "增强趋势策略 (Redis+KDJ/RSI)",
    description: "基于Redis缓存的K线数据，使用KDJ/RSI技术指标进行智能分析",
    component: EnhancedTrendApp,
  },
  {
    id: "maker",
    label: "做市刷单策略",
    description: "双边挂单提供流动性，自动追价与风控止损",
    component: MakerApp,
  },
  {
    id: "offset-maker",
    label: "偏移做市策略",
    description: "根据盘口深度自动偏移挂单并在极端不平衡时撤退",
    component: OffsetMakerApp,
  },
];

// Prefer Ink's stdin detection to avoid false negatives when spawned by shells
// that don't propagate process.stdin TTY flags correctly.
function useInputSupported() {
  const { isRawModeSupported } = useStdin();
  return Boolean(isRawModeSupported);
}

export function App() {
  const inputSupported = useInputSupported();
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<StrategyOption | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useInput(
    (input, key) => {
      if (selected) return;
      
      if (showExitConfirm) {
        if (key.return || input === 'y' || input === 'Y') {
          // 确认退出
          console.log('\n👋 用户确认退出');
          if ((global as any).unmountApp) {
            (global as any).unmountApp();
          }
          setTimeout(() => {
            console.log('✅ 程序正常退出，感谢使用！\n');
            process.exit(0);
          }, 500);
        } else if (key.escape || input === 'n' || input === 'N') {
          // 取消退出
          setShowExitConfirm(false);
        }
        return;
      }
      
      if (key.upArrow) {
        setCursor((prev) => (prev - 1 + STRATEGIES.length) % STRATEGIES.length);
      } else if (key.downArrow) {
        setCursor((prev) => (prev + 1) % STRATEGIES.length);
      } else if (key.return) {
        const strategy = STRATEGIES[cursor];
        if (strategy) {
          setSelected(strategy);
        }
      } else if (input === 'q' || input === 'Q') {
        // 按q快速退出确认
        setShowExitConfirm(true);
      }
    },
    { isActive: inputSupported && !selected }
  );

  if (showExitConfirm) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text color="yellow">⚠️ 确认退出程序？</Text>
        <Text color="gray">按 Y/回车 确认退出，按 N/ESC 取消</Text>
      </Box>
    );
  }

  if (selected) {
    const Selected = selected.component;
    return <Selected onExit={() => setSelected(null)} />;
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color="cyanBright">请选择要运行的策略</Text>
      <Text color="gray">使用 ↑/↓ 选择，回车开始，Q 退出程序，Ctrl+C 强制退出。</Text>
      <Box flexDirection="column" marginTop={1}>
        {STRATEGIES.map((strategy, index) => {
          const active = index === cursor;
          return (
            <Box key={strategy.id} flexDirection="column" marginBottom={1}>
              <Text color={active ? "greenBright" : undefined}>
                {active ? "➤" : "  "} {strategy.label}
              </Text>
              <Text color="gray">    {strategy.description}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>提示: 在策略运行中按 ESC 返回此菜单</Text>
      </Box>
    </Box>
  );
}
