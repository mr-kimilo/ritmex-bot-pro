import * as React from "react";
import { useEffect, useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { EnhancedTrendEngine, type EnhancedTrendEngineSnapshot } from "../core/enhanced-trend-engine";
import { AsterExchangeAdapter } from "../exchanges/aster-adapter";
import { tradingConfig, redisConfig, technicalAnalysisConfig } from "../config";
import type { KlineManagerConfig } from "../utils/redis-kline-manager";
import type { MarketAnalyzerConfig } from "../utils/market-analyzer";

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
      if (key.escape) {
        onExit();
      } else if (input === 'r' || input === 'R') {
        // 手动刷新分析
        if (engineRef.current) {
          engineRef.current.forceRefreshAnalysis().catch(console.error);
        }
      } else if (input === 's' || input === 'S') {
        // 显示市场概览
        if (engineRef.current) {
          const summary = engineRef.current.getMarketSummary();
          console.log('\n📊 市场概览:', JSON.stringify(summary, null, 2));
        }
      }
    },
    { isActive: true }
  );

  useEffect(() => {
    let mounted = true;

    const initEngine = async () => {
      try {
        console.log('🚀 启动增强趋势引擎...');
        
        // 创建交易所适配器
        const exchange = new AsterExchangeAdapter({
          apiKey: process.env.API_KEY,
          apiSecret: process.env.API_SECRET,
          symbol: tradingConfig.symbol
        });

        // 创建Redis K线管理器配置
        const klineConfig: KlineManagerConfig = {
          redisHost: redisConfig?.host || 'localhost',
          redisPort: redisConfig?.port || 6379,
          redisPassword: redisConfig?.password,
          cacheTtl: redisConfig?.cacheTtl || 3600,
          keyPrefix: 'kline:',
          maxKlines: redisConfig?.maxKlines || 1000
        };

        // 创建市场分析器配置
        const analyzerConfig: MarketAnalyzerConfig = {
          kdjPeriod: technicalAnalysisConfig?.kdjPeriod || 14,
          rsiPeriod: technicalAnalysisConfig?.rsiPeriod || 14,
          volumeMaPeriod: technicalAnalysisConfig?.volumeMaPeriod || 20,
          priceRangePeriod: (technicalAnalysisConfig?.priceRangeHours || 3) * 60,
          overboughtLevel: 70,
          oversoldLevel: 30,
          highVolumeThreshold: technicalAnalysisConfig?.minVolumeRatio || 1.5,
          confidenceThreshold: technicalAnalysisConfig?.confidenceThreshold || 0.7,
          cacheTTL: 300,
          priceRangeHours: technicalAnalysisConfig?.priceRangeHours || 3,
          volatilityPeriod: 20,
          minVolumeRatio: technicalAnalysisConfig?.minVolumeRatio || 1.5
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
        
        if (mounted) {
          setIsInitialized(true);
          console.log('✅ 增强趋势引擎启动完成');
        }

      } catch (error) {
        console.error('❌ 增强趋势引擎初始化失败:', error);
        if (mounted) {
          setInitError(String(error));
        }
      }
    };

    initEngine();

    return () => {
      mounted = false;
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current.cleanup().catch(console.error);
        engineRef.current = null;
      }
    };
  }, []);

  if (initError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ 初始化失败</Text>
        <Text color="gray">{initError}</Text>
        <Text color="yellow">按 ESC 返回菜单</Text>
      </Box>
    );
  }

  if (!isInitialized || !snapshot) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue">🚀 增强趋势引擎启动中...</Text>
        <Text color="gray">正在连接Redis和交易所...</Text>
        <Text color="yellow">按 ESC 返回菜单</Text>
      </Box>
    );
  }

  const analysis = snapshot.marketAnalysis;
  const recommendation = engineRef.current?.getAnalysisRecommendation();
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text color="cyanBright">🚀 增强趋势引擎 ({tradingConfig.symbol})</Text>
        <Text color="gray">
          Redis: {engineRef.current?.getRedisStatus() ? '🟢' : '🔴'} | 
          增强: {engineRef.current?.isEnhancedModeEnabled() ? '✅' : '❌'}
        </Text>
      </Box>

      {/* 当前价格和基础信息 */}
      <Box flexDirection="row" gap={4} marginY={1}>
        <Box>
          <Text color="white">价格: </Text>
          <Text color="yellow">${snapshot.lastPrice?.toFixed(4) || 'N/A'}</Text>
        </Box>
        <Box>
          <Text color="white">SMA30: </Text>
          <Text color="blue">${snapshot.sma30?.toFixed(4) || 'N/A'}</Text>
        </Box>
        <Box>
          <Text color="white">趋势: </Text>
          <Text color={
            snapshot.trend === '做多' ? 'green' : 
            snapshot.trend === '做空' ? 'red' : 'gray'
          }>{snapshot.trend}</Text>
        </Box>
      </Box>

      {/* 持仓信息 */}
      <Box flexDirection="row" gap={4} marginY={1}>
        <Box>
          <Text color="white">持仓: </Text>
          <Text color={
            snapshot.position.positionAmt > 0 ? 'green' :
            snapshot.position.positionAmt < 0 ? 'red' : 'gray'
          }>
            {snapshot.position.positionAmt === 0 ? '无持仓' :
             snapshot.position.positionAmt > 0 ? `多头 ${Math.abs(snapshot.position.positionAmt)}` :
             `空头 ${Math.abs(snapshot.position.positionAmt)}`}
          </Text>
        </Box>
        <Box>
          <Text color="white">未实现: </Text>
          <Text color={snapshot.unrealized >= 0 ? 'green' : 'red'}>
            ${snapshot.unrealized.toFixed(2)}
          </Text>
        </Box>
        <Box>
          <Text color="white">总盈亏: </Text>
          <Text color={snapshot.totalProfit >= 0 ? 'green' : 'red'}>
            ${snapshot.totalProfit.toFixed(2)}
          </Text>
        </Box>
      </Box>

      {/* 技术分析信息 */}
      {analysis && (
        <Box flexDirection="column" marginY={1} borderStyle="single" paddingX={1}>
          <Text color="cyanBright">📊 技术分析</Text>
          <Box flexDirection="row" gap={4}>
            <Box>
              <Text color="white">信号: </Text>
              <Text color={
                analysis.signal === 'BUY' ? 'green' :
                analysis.signal === 'SELL' ? 'red' : 'yellow'
              }>{analysis.signal}</Text>
            </Box>
            <Box>
              <Text color="white">置信度: </Text>
              <Text color={
                analysis.confidence >= 0.8 ? 'green' :
                analysis.confidence >= 0.6 ? 'yellow' : 'red'
              }>{(analysis.confidence * 100).toFixed(1)}%</Text>
            </Box>
            <Box>
              <Text color="white">风险: </Text>
              <Text color={
                analysis.riskLevel === 'LOW' ? 'green' :
                analysis.riskLevel === 'MEDIUM' ? 'yellow' : 'red'
              }>{analysis.riskLevel}</Text>
            </Box>
          </Box>
          
          <Box flexDirection="row" gap={4} marginTop={1}>
            <Box>
              <Text color="white">KDJ: </Text>
              <Text color="cyan">K={analysis.technicalIndicators.kdj.k.toFixed(1)} D={analysis.technicalIndicators.kdj.d.toFixed(1)}</Text>
            </Box>
            <Box>
              <Text color="white">RSI: </Text>
              <Text color={
                analysis.technicalIndicators.rsi.overbought ? 'red' :
                analysis.technicalIndicators.rsi.oversold ? 'green' : 'white'
              }>{analysis.technicalIndicators.rsi.rsi.toFixed(1)}</Text>
            </Box>
            <Box>
              <Text color="white">成交量: </Text>
              <Text color={analysis.technicalIndicators.volume.isHighVolume ? 'yellow' : 'gray'}>
                {analysis.technicalIndicators.volume.volumeRatio.toFixed(2)}x
              </Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color="white">建议: </Text>
            <Text color="blue">{analysis.suggestedAction}</Text>
          </Box>
        </Box>
      )}

      {/* 交易建议 */}
      {recommendation && (
        <Box flexDirection="row" gap={4} marginY={1}>
          <Box>
            <Text color="white">开仓建议: </Text>
            <Text color={recommendation.shouldOpenPosition ? 'green' : 'red'}>
              {recommendation.shouldOpenPosition ? '✅ 建议开仓' : '❌ 不建议开仓'}
            </Text>
          </Box>
          <Box>
            <Text color="white">平仓建议: </Text>
            <Text color={recommendation.shouldClosePosition ? 'yellow' : 'gray'}>
              {recommendation.shouldClosePosition ? '⚠️ 考虑平仓' : '➖ 持有'}
            </Text>
          </Box>
        </Box>
      )}

      {/* 交易日志 */}
      <Box flexDirection="column" marginTop={1} borderStyle="single" paddingX={1}>
        <Text color="cyanBright">📋 交易日志 (最近10条)</Text>
        <Box flexDirection="column" height={8}>
          {snapshot.tradeLog.slice(-10).reverse().map((log, index) => (
            <Text key={index} color={
              log.type === 'error' ? 'red' :
              log.type === 'warning' ? 'yellow' :
              log.type === 'signal' ? 'blue' :
              log.type === 'position' ? 'green' : 'gray'
            } dimColor>
              {log.time} {log.detail}
            </Text>
          ))}
        </Box>
      </Box>

      {/* 控制提示 */}
      <Box marginTop={1}>
        <Text color="gray">ESC: 返回菜单 | R: 刷新分析 | S: 显示概览</Text>
      </Box>
    </Box>
  );
}
