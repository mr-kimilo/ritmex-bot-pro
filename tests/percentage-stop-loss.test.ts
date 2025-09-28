import { describe, it, expect } from 'vitest';
import { shouldStopLossByPercentage, shouldTakeProfitByPercentage, type PositionSnapshot } from '../src/utils/strategy.js';

describe('百分比止损止盈功能测试', () => {
  
  // 创建测试持仓的辅助函数
  function createPosition(positionAmt: number, entryPrice: number): PositionSnapshot {
    return {
      positionAmt,
      entryPrice,
      unrealizedProfit: 0,
      markPrice: null,
    };
  }

  describe('shouldStopLossByPercentage 百分比止损测试', () => {
    it('多头持仓：价格下跌0.75%时应该触发止损', () => {
      const position = createPosition(20, 1.85); // 20个币，入场价1.85
      const currentPrice = 1.85 * (1 - 0.0075); // 下跌0.75%
      const stopLossPercentage = 0.0075; // 0.75%止损
      
      const shouldStop = shouldStopLossByPercentage(position, currentPrice, stopLossPercentage);
      expect(shouldStop).toBe(true);
    });

    it('多头持仓：价格下跌0.74%时不应该触发止损', () => {
      const position = createPosition(20, 1.85);
      const currentPrice = 1.85 * (1 - 0.0074); // 下跌0.74%
      const stopLossPercentage = 0.0075;
      
      const shouldStop = shouldStopLossByPercentage(position, currentPrice, stopLossPercentage);
      expect(shouldStop).toBe(false);
    });

    it('多头持仓：价格上涨时不应该触发止损', () => {
      const position = createPosition(20, 1.85);
      const currentPrice = 1.90; // 上涨
      const stopLossPercentage = 0.0075;
      
      const shouldStop = shouldStopLossByPercentage(position, currentPrice, stopLossPercentage);
      expect(shouldStop).toBe(false);
    });

    it('空头持仓：价格上涨0.75%时应该触发止损', () => {
      const position = createPosition(-20, 1.85); // -20个币（空头）
      const currentPrice = 1.85 * (1 + 0.0075); // 上涨0.75%
      const stopLossPercentage = 0.0075;
      
      const shouldStop = shouldStopLossByPercentage(position, currentPrice, stopLossPercentage);
      expect(shouldStop).toBe(true);
    });

    it('空头持仓：价格下跌时不应该触发止损', () => {
      const position = createPosition(-20, 1.85);
      const currentPrice = 1.80; // 下跌
      const stopLossPercentage = 0.0075;
      
      const shouldStop = shouldStopLossByPercentage(position, currentPrice, stopLossPercentage);
      expect(shouldStop).toBe(false);
    });

    it('无持仓时不应该触发止损', () => {
      const position = createPosition(0, 1.85);
      const currentPrice = 1.50; // 任意价格
      const stopLossPercentage = 0.0075;
      
      const shouldStop = shouldStopLossByPercentage(position, currentPrice, stopLossPercentage);
      expect(shouldStop).toBe(false);
    });

    it('无效入场价时不应该触发止损', () => {
      const position = createPosition(20, 0); // 无效入场价
      const currentPrice = 1.80;
      const stopLossPercentage = 0.0075;
      
      const shouldStop = shouldStopLossByPercentage(position, currentPrice, stopLossPercentage);
      expect(shouldStop).toBe(false);
    });
  });

  describe('shouldTakeProfitByPercentage 百分比止盈测试', () => {
    it('多头持仓：价格上涨1.5%时应该触发止盈', () => {
      const position = createPosition(20, 1.85);
      const currentPrice = 1.85 * (1 + 0.015); // 上涨1.5%
      const takeProfitPercentage = 0.015; // 1.5%止盈
      
      const shouldTakeProfit = shouldTakeProfitByPercentage(position, currentPrice, takeProfitPercentage);
      expect(shouldTakeProfit).toBe(true);
    });

    it('多头持仓：价格上涨1.4%时不应该触发止盈', () => {
      const position = createPosition(20, 1.85);
      const currentPrice = 1.85 * (1 + 0.014); // 上涨1.4%
      const takeProfitPercentage = 0.015;
      
      const shouldTakeProfit = shouldTakeProfitByPercentage(position, currentPrice, takeProfitPercentage);
      expect(shouldTakeProfit).toBe(false);
    });

    it('空头持仓：价格下跌1.5%时应该触发止盈', () => {
      const position = createPosition(-20, 1.85);
      const currentPrice = 1.85 * (1 - 0.015); // 下跌1.5%
      const takeProfitPercentage = 0.015;
      
      const shouldTakeProfit = shouldTakeProfitByPercentage(position, currentPrice, takeProfitPercentage);
      expect(shouldTakeProfit).toBe(true);
    });

    it('亏损时不应该触发止盈', () => {
      const position = createPosition(20, 1.85);
      const currentPrice = 1.80; // 下跌（亏损）
      const takeProfitPercentage = 0.015;
      
      const shouldTakeProfit = shouldTakeProfitByPercentage(position, currentPrice, takeProfitPercentage);
      expect(shouldTakeProfit).toBe(false);
    });
  });

  describe('实际交易场景模拟', () => {
    it('ASTER多头：$1.85入场，跌到$1.836时应该止损', () => {
      const position = createPosition(20, 1.85);
      const currentPrice = 1.836; // 约下跌0.76%
      const stopLossPercentage = 0.0075; // 0.75%
      
      const shouldStop = shouldStopLossByPercentage(position, currentPrice, stopLossPercentage);
      expect(shouldStop).toBe(true);
      
      // 验证实际亏损百分比
      const actualLossPercentage = (1.85 - 1.836) / 1.85;
      expect(actualLossPercentage).toBeCloseTo(0.00757, 5); // 约0.757%
    });

    it('ASTER多头：$1.85入场，涨到$1.878时应该止盈', () => {
      const position = createPosition(20, 1.85);
      const currentPrice = 1.878; // 约上涨1.51%
      const takeProfitPercentage = 0.015; // 1.5%
      
      const shouldTakeProfit = shouldTakeProfitByPercentage(position, currentPrice, takeProfitPercentage);
      expect(shouldTakeProfit).toBe(true);
      
      // 验证实际盈利百分比
      const actualProfitPercentage = (1.878 - 1.85) / 1.85;
      expect(actualProfitPercentage).toBeCloseTo(0.01514, 5); // 约1.514%
    });

    it('价格变化但仍在安全区间内', () => {
      const position = createPosition(20, 1.85);
      const stopLossPercentage = 0.0075;
      const takeProfitPercentage = 0.015;
      
      // 测试价格在安全区间内的多个点
      const testPrices = [1.848, 1.845, 1.852, 1.840, 1.860];
      
      testPrices.forEach(price => {
        const shouldStop = shouldStopLossByPercentage(position, price, stopLossPercentage);
        const shouldTakeProfit = shouldTakeProfitByPercentage(position, price, takeProfitPercentage);
        
        const lossPercentage = (1.85 - price) / 1.85;
        const profitPercentage = (price - 1.85) / 1.85;
        
        if (lossPercentage > stopLossPercentage) {
          expect(shouldStop).toBe(true);
        } else if (profitPercentage > takeProfitPercentage) {
          expect(shouldTakeProfit).toBe(true);
        } else {
          expect(shouldStop).toBe(false);
          expect(shouldTakeProfit).toBe(false);
        }
      });
    });
  });
});
