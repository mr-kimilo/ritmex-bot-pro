import { describe, test, expect, it } from 'vitest';
import { shouldMakerStopLoss, shouldMakerTakeProfit, computeMakerPnl } from '../src/utils/maker-risk.js';
import type { PositionSnapshot } from '../src/utils/strategy.js';

// 模拟持仓数据
function createPosition(positionAmt: number, entryPrice: number): PositionSnapshot {
  return {
    positionAmt,
    entryPrice,
    markPrice: entryPrice,
    unrealizedProfit: 0
  };
}

describe('做市商风险管理测试', () => {
  
  describe('computeMakerPnl 盈亏计算', () => {
    it('多头持仓盈利计算', () => {
      const position = createPosition(20, 1.85); // 20个币，开仓价1.85
      const bidPrice = 1.90; // 当前买价1.90
      const askPrice = 1.91; // 当前卖价1.91
      
      // 多头平仓用买价：(1.90 - 1.85) * 20 = 1.0
      const pnl = computeMakerPnl(position, bidPrice, askPrice);
      expect(pnl).toBeCloseTo(1.0, 2);
    });

    it('多头持仓亏损计算', () => {
      const position = createPosition(20, 1.90); // 20个币，开仓价1.90
      const bidPrice = 1.85; // 当前买价1.85
      const askPrice = 1.86; // 当前卖价1.86
      
      // 多头平仓用买价：(1.85 - 1.90) * 20 = -1.0
      const pnl = computeMakerPnl(position, bidPrice, askPrice);
      expect(pnl).toBeCloseTo(-1.0, 2);
    });

    it('空头持仓盈利计算', () => {
      const position = createPosition(-20, 1.90); // -20个币，开仓价1.90
      const bidPrice = 1.85; // 当前买价1.85  
      const askPrice = 1.86; // 当前卖价1.86
      
      // 空头平仓用卖价：(1.86 - 1.90) * (-20) = 0.8
      const pnl = computeMakerPnl(position, bidPrice, askPrice);
      expect(pnl).toBeCloseTo(0.8, 2);
    });

    it('空头持仓亏损计算', () => {
      const position = createPosition(-20, 1.85); // -20个币，开仓价1.85
      const bidPrice = 1.90; // 当前买价1.90
      const askPrice = 1.91; // 当前卖价1.91
      
      // 空头平仓用卖价：(1.91 - 1.85) * (-20) = -1.2
      const pnl = computeMakerPnl(position, bidPrice, askPrice);
      expect(pnl).toBeCloseTo(-1.2, 2);
    });

    it('无持仓时PnL为0', () => {
      const position = createPosition(0, 1.85);
      const pnl = computeMakerPnl(position, 1.90, 1.91);
      expect(pnl).toBe(0);
    });

    it('无效入场价时PnL为0', () => {
      const position = createPosition(20, 0); // 无效的入场价
      const pnl = computeMakerPnl(position, 1.90, 1.91);
      expect(pnl).toBe(0);
    });
  });

  describe('shouldMakerStopLoss 止损判断', () => {
    it('多头亏损超过限制时触发止损', () => {
      const position = createPosition(20, 1.90); // 20个币，开仓价1.90
      const bidPrice = 1.87; // 买价1.87
      const askPrice = 1.88; // 卖价1.88
      const lossLimit = 0.50; // 止损限制$0.50
      
      // 当前亏损：(1.87 - 1.90) * 20 = -0.6 > 0.5，应该止损
      const shouldStop = shouldMakerStopLoss(position, bidPrice, askPrice, lossLimit);
      expect(shouldStop).toBe(true);
    });

    it('空头亏损超过限制时触发止损', () => {
      const position = createPosition(-20, 1.85); // -20个币，开仓价1.85
      const bidPrice = 1.88; // 买价1.88
      const askPrice = 1.89; // 卖价1.89
      const lossLimit = 0.70; // 止损限制$0.70
      
      // 当前亏损：(1.89 - 1.85) * (-20) = -0.8 > 0.7，应该止损
      const shouldStop = shouldMakerStopLoss(position, bidPrice, askPrice, lossLimit);
      expect(shouldStop).toBe(true);
    });

    it('亏损未达到限制时不触发止损', () => {
      const position = createPosition(20, 1.90); // 20个币，开仓价1.90
      const bidPrice = 1.89; // 买价1.89
      const askPrice = 1.90; // 卖价1.90
      const lossLimit = 0.50; // 止损限制$0.50
      
      // 当前亏损：(1.89 - 1.90) * 20 = -0.2 < 0.5，不应该止损
      const shouldStop = shouldMakerStopLoss(position, bidPrice, askPrice, lossLimit);
      expect(shouldStop).toBe(false);
    });

    it('盈利时不触发止损', () => {
      const position = createPosition(20, 1.85); // 20个币，开仓价1.85
      const bidPrice = 1.90; // 买价1.90
      const askPrice = 1.91; // 卖价1.91
      const lossLimit = 0.25; // 止损限制$0.25
      
      // 当前盈利：(1.90 - 1.85) * 20 = 1.0 > 0，不应该止损
      const shouldStop = shouldMakerStopLoss(position, bidPrice, askPrice, lossLimit);
      expect(shouldStop).toBe(false);
    });
  });

  describe('shouldMakerTakeProfit 止盈判断', () => {
    it('多头盈利达到目标时触发止盈', () => {
      const position = createPosition(20, 1.85); // 20个币，开仓价1.85
      const bidPrice = 1.88; // 买价1.88
      const askPrice = 1.89; // 卖价1.89
      const profitTarget = 0.50; // 止盈目标$0.50
      
      // 当前盈利：(1.88 - 1.85) * 20 = 0.6 > 0.5，应该止盈
      const shouldTakeProfit = shouldMakerTakeProfit(position, bidPrice, askPrice, profitTarget);
      expect(shouldTakeProfit).toBe(true);
    });

    it('空头盈利达到目标时触发止盈', () => {
      const position = createPosition(-20, 1.90); // -20个币，开仓价1.90
      const bidPrice = 1.85; // 买价1.85
      const askPrice = 1.86; // 卖价1.86
      const profitTarget = 0.60; // 止盈目标$0.60
      
      // 当前盈利：(1.86 - 1.90) * (-20) = 0.8 > 0.6，应该止盈
      const shouldTakeProfit = shouldMakerTakeProfit(position, bidPrice, askPrice, profitTarget);
      expect(shouldTakeProfit).toBe(true);
    });

    it('盈利未达到目标时不触发止盈', () => {
      const position = createPosition(20, 1.85); // 20个币，开仓价1.85
      const bidPrice = 1.86; // 买价1.86
      const askPrice = 1.87; // 卖价1.87
      const profitTarget = 0.50; // 止盈目标$0.50
      
      // 当前盈利：(1.86 - 1.85) * 20 = 0.2 < 0.5，不应该止盈
      const shouldTakeProfit = shouldMakerTakeProfit(position, bidPrice, askPrice, profitTarget);
      expect(shouldTakeProfit).toBe(false);
    });

    it('亏损时不触发止盈', () => {
      const position = createPosition(20, 1.90); // 20个币，开仓价1.90
      const bidPrice = 1.85; // 买价1.85
      const askPrice = 1.86; // 卖价1.86
      const profitTarget = 0.25; // 止盈目标$0.25
      
      // 当前亏损：(1.85 - 1.90) * 20 = -1.0 < 0，不应该止盈
      const shouldTakeProfit = shouldMakerTakeProfit(position, bidPrice, askPrice, profitTarget);
      expect(shouldTakeProfit).toBe(false);
    });
  });

  describe('风险配置合理性测试', () => {
    it('止盈目标应该大于止损限制', () => {
      const lossLimit = 0.25;
      const profitTarget = 0.50;
      
      expect(profitTarget).toBeGreaterThan(lossLimit);
      expect(profitTarget / lossLimit).toBeGreaterThanOrEqual(2); // 至少2:1的盈亏比
    });

    it('实际场景测试：合理的盈亏比配置', () => {
      const position = createPosition(20, 1.85); // 20ASTER @ $1.85
      const lossLimit = 0.25; // 止损$0.25
      const profitTarget = 0.50; // 止盈$0.50
      
      // 止损场景：价格跌到1.837时止损（略超过止损线）
      const stopLossPrice = 1.85 - (lossLimit / 20) - 0.001; // 1.8365
      const shouldStop = shouldMakerStopLoss(position, stopLossPrice, stopLossPrice + 0.001, lossLimit);
      
      // 止盈场景：价格涨到1.876时止盈（略超过止盈线）
      const takeProfitPrice = 1.85 + (profitTarget / 20) + 0.001; // 1.8765
      const shouldTakeProfit = shouldMakerTakeProfit(position, takeProfitPrice, takeProfitPrice + 0.001, profitTarget);
      
      expect(shouldStop).toBe(true);
      expect(shouldTakeProfit).toBe(true);
      
      // 验证价格差
      const priceRiskRange = takeProfitPrice - stopLossPrice; // 约0.04
      expect(priceRiskRange).toBeGreaterThan(0.03); // 至少3分的价格空间
    });
  });

  describe('边界条件测试', () => {
    it('极小持仓量', () => {
      const position = createPosition(0.001, 1.85);
      const pnl = computeMakerPnl(position, 2.00, 2.01);
      expect(Math.abs(pnl)).toBeLessThan(0.001); // 极小的盈亏
    });

    it('极大价格变动', () => {
      const position = createPosition(20, 1.85);
      const bidPrice = 0.50; // 极端下跌
      const askPrice = 0.51;
      const lossLimit = 0.25;
      
      const shouldStop = shouldMakerStopLoss(position, bidPrice, askPrice, lossLimit);
      expect(shouldStop).toBe(true); // 应该立即止损
    });

    it('价格精度测试', () => {
      const position = createPosition(20, 1.85000);
      const bidPrice = 1.85001; // 微小变动
      const askPrice = 1.85002;
      
      const pnl = computeMakerPnl(position, bidPrice, askPrice);
      expect(pnl).toBeCloseTo(0.0002, 4); // 精确到小数点后4位
    });
  });
});
