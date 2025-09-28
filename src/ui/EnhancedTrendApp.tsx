import React from "react";
import { useEffect, useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { EnhancedTrendEngine, type EnhancedTrendEngineSnapshot } from "../core/enhanced-trend-engine";
import { AsterExchangeAdapter } from "../exchanges/aster-adapter";
import { tradingConfig, redisConfig, technicalAnalysisConfig } from "../config";
import { ApiCredentialsFactory } from "../api-credentials-factory";
import type { KlineManagerConfig } from "../utils/redis-kline-manager";
import type { MarketAnalyzerConfig } from "../utils/market-analyzer";
import { TradingDashboard, type BaseTradingSnapshot } from "./components/TradingDashboard";

interface EnhancedTrendAppProps {
  onExit: () => void;
}

export function EnhancedTrendApp({ onExit }: EnhancedTrendAppProps) {
  const [snapshot, setSnapshot] = useState<EnhancedTrendEngineSnapshot | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const engineRef = useRef<EnhancedTrendEngine | null>(null);

  useInput(
    (input, key) => {
      if (input === 'q' || key.escape) {
        if (engineRef.current) {
          engineRef.current.stop();
        }
        onExit();
      }
    }
  );

  useEffect(() => {
    let mounted = true;

    async function initializeEngine() {
      try {
        console.log('🔮 正在初始化增强趋势引擎...');
        
        // 使用API凭证工厂创建凭证
        const credentialsFactory = new ApiCredentialsFactory();
        let asterCredentials;
        
        try {
          // 首先尝试通过交易对获取凭证
          asterCredentials = credentialsFactory.createCredentialsBySymbol(tradingConfig.symbol);
        } catch (error) {
          console.log('� 尝试使用默认实例凭证...');
          // 回退到默认实例
          asterCredentials = credentialsFactory.createAsterCredentials('default', tradingConfig.symbol);
        }
        
        if (!asterCredentials.apiKey || !asterCredentials.apiSecret) {
          throw new Error('无法获取API凭证，请检查配置文件或环境变量');
        }

        const exchange = new AsterExchangeAdapter(asterCredentials);

        // K线管理器配置
        const klineConfig: KlineManagerConfig = {
          redisHost: redisConfig.host,
          redisPort: redisConfig.port,
          redisPassword: redisConfig.password,
          cacheTtl: 3600,
          maxKlines: 200,
          keyPrefix: `kline:${tradingConfig.symbol}:`
        };

        // 市场分析器配置
        const analyzerConfig: MarketAnalyzerConfig = {
          kdjPeriod: technicalAnalysisConfig?.kdjPeriod || 14,
          rsiPeriod: technicalAnalysisConfig?.rsiPeriod || 14,
          volumeMaPeriod: technicalAnalysisConfig?.volumeMaPeriod || 20,
          confidenceThreshold: technicalAnalysisConfig?.confidenceThreshold || 0.7,
          priceRangeHours: technicalAnalysisConfig?.priceRangeHours || 3,
          volatilityPeriod: technicalAnalysisConfig?.volatilityPeriod || 20,
          minVolumeRatio: technicalAnalysisConfig?.minVolumeRatio || 1.5,
          priceRangePeriod: 24,
          overboughtLevel: 80,
          oversoldLevel: 20,
          highVolumeThreshold: 2.0,
          cacheTTL: 300
        };

        // 创建增强趋势引擎
        const engine = new EnhancedTrendEngine(
          tradingConfig,
          exchange,
          klineConfig,
          analyzerConfig,
          true // 启用增强模式
        );

        engineRef.current = engine;

        // 监听更新
        engine.on('update', (snapshot: EnhancedTrendEngineSnapshot) => {
          if (mounted) {
            setSnapshot(snapshot);
          }
        });

        // 启动引擎
        engine.start();
        
        // 等待初始化
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 手动触发一次分析
        await engine.forceRefreshAnalysis();
        
        // 定期更新快照以确保UI数据同步 (特别是手续费数据)
        const updateInterval = setInterval(() => {
          if (mounted && engine) {
            const currentSnapshot = engine.getSnapshot();
            setSnapshot(currentSnapshot);
          }
        }, 5000); // 每5秒更新一次
        
        if (mounted) {
          setIsInitialized(true);
        }

        // 清理定时器
        return () => {
          clearInterval(updateInterval);
        };

      } catch (error) {
        console.error('🚫 增强趋势引擎初始化失败:', error);
        if (mounted) {
          setInitError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    initializeEngine();

    return () => {
      mounted = false;
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, []);

  if (initError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ 增强趋势引擎启动失败</Text>
        <Text>{initError}</Text>
        <Text color="gray">按 q 或 ESC 返回主菜单</Text>
      </Box>
    );
  }

  if (!isInitialized) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">⏳ 正在初始化增强趋势引擎...</Text>
        <Text color="gray">请等待系统完成初始化和数据同步</Text>
        <Text color="gray">按 q 或 ESC 返回主菜单</Text>
      </Box>
    );
  }

  if (!snapshot) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue">📊 等待引擎数据...</Text>
        <Text color="gray">系统正在收集市场数据进行分析</Text>
        <Text color="gray">按 q 或 ESC 返回主菜单</Text>
      </Box>
    );
  }

  // 转换为通用快照格式
  const dashboardSnapshot: BaseTradingSnapshot = {
    ...snapshot,
    feeStats: snapshot.feeStats || {  // 确保手续费统计始终可用
      totalFee: 0,
      dailyFee: 0,
      dailyFeePercent: 0,
      hourlyFeePercent: 0,
      tradeCount: 0,
      avgFeeRate: 0,
      isWarning: false,
      shouldStop: false,
      feeEfficiency: 0
    },
    enhancedMode: true,
    enhanced: {
      enabled: snapshot.enhanced?.enabled || false,
      lastAnalysis: snapshot.enhanced?.lastAnalysis,
      lastSignal: snapshot.enhanced?.lastSignal,
      confidenceThreshold: snapshot.enhanced?.confidenceThreshold,
      feeProtection: snapshot.enhanced?.feeProtection
    }
  };

  return <TradingDashboard snapshot={dashboardSnapshot} title="增强趋势策略" />;
}
