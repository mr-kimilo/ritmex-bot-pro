import { describe, it, expect } from 'vitest';

describe('趋势策略百分比风险管理测试', () => {
  
  // 模拟趋势策略的百分比计算
  function calculateStopLossPrice(entryPrice: number, riskPercentage: number, isLong: boolean): number {
    if (isLong) {
      return entryPrice * (1 - riskPercentage);
    } else {
      return entryPrice * (1 + riskPercentage);
    }
  }

  function calculateTakeProfitPrice(entryPrice: number, profitTargetPercentage: number, isLong: boolean): number {
    if (isLong) {
      return entryPrice * (1 + profitTargetPercentage);
    } else {
      return entryPrice * (1 - profitTargetPercentage);
    }
  }

  function calculatePnlPercentage(entryPrice: number, currentPrice: number, isLong: boolean): number {
    if (isLong) {
      return (currentPrice - entryPrice) / entryPrice;
    } else {
      return (entryPrice - currentPrice) / entryPrice;
    }
  }

  describe('多头持仓百分比计算', () => {
    const entryPrice = 1.85; // ASTER入场价
    const riskPercentage = 0.0075; // 0.75%止损
    const profitTargetPercentage = 0.015; // 1.5%止盈

    it('多头0.75%止损价格计算', () => {
      const stopLossPrice = calculateStopLossPrice(entryPrice, riskPercentage, true);
      const expectedStopLoss = 1.85 * (1 - 0.0075); // 1.836125
      
      expect(stopLossPrice).toBeCloseTo(expectedStopLoss, 6);
      expect(stopLossPrice).toBeCloseTo(1.836125, 6);
    });

    it('多头1.5%止盈价格计算', () => {
      const takeProfitPrice = calculateTakeProfitPrice(entryPrice, profitTargetPercentage, true);
      const expectedTakeProfit = 1.85 * (1 + 0.015); // 1.87775
      
      expect(takeProfitPrice).toBeCloseTo(expectedTakeProfit, 6);
      expect(takeProfitPrice).toBeCloseTo(1.87775, 6);
    });

    it('多头盈亏百分比验证', () => {
      const stopLossPrice = calculateStopLossPrice(entryPrice, riskPercentage, true);
      const takeProfitPrice = calculateTakeProfitPrice(entryPrice, profitTargetPercentage, true);
      
      const lossPercentage = calculatePnlPercentage(entryPrice, stopLossPrice, true);
      const profitPercentage = calculatePnlPercentage(entryPrice, takeProfitPrice, true);
      
      expect(lossPercentage).toBeCloseTo(-0.0075, 6); // -0.75%
      expect(profitPercentage).toBeCloseTo(0.015, 6); // +1.5%
    });
  });

  describe('空头持仓百分比计算', () => {
    const entryPrice = 1.85; // ASTER入场价
    const riskPercentage = 0.0075; // 0.75%止损
    const profitTargetPercentage = 0.015; // 1.5%止盈

    it('空头0.75%止损价格计算', () => {
      const stopLossPrice = calculateStopLossPrice(entryPrice, riskPercentage, false);
      const expectedStopLoss = 1.85 * (1 + 0.0075); // 1.863875
      
      expect(stopLossPrice).toBeCloseTo(expectedStopLoss, 6);
      expect(stopLossPrice).toBeCloseTo(1.863875, 6);
    });

    it('空头1.5%止盈价格计算', () => {
      const takeProfitPrice = calculateTakeProfitPrice(entryPrice, profitTargetPercentage, false);
      const expectedTakeProfit = 1.85 * (1 - 0.015); // 1.82225
      
      expect(takeProfitPrice).toBeCloseTo(expectedTakeProfit, 6);
      expect(takeProfitPrice).toBeCloseTo(1.82225, 6);
    });

    it('空头盈亏百分比验证', () => {
      const stopLossPrice = calculateStopLossPrice(entryPrice, riskPercentage, false);
      const takeProfitPrice = calculateTakeProfitPrice(entryPrice, profitTargetPercentage, false);
      
      const lossPercentage = calculatePnlPercentage(entryPrice, stopLossPrice, false);
      const profitPercentage = calculatePnlPercentage(entryPrice, takeProfitPrice, false);
      
      expect(lossPercentage).toBeCloseTo(-0.0075, 6); // -0.75%
      expect(profitPercentage).toBeCloseTo(0.015, 6); // +1.5%
    });
  });

  describe('盈亏比配置验证', () => {
    it('验证2:1盈亏比', () => {
      const riskPercentage = 0.0075; // 0.75%
      const profitTargetPercentage = 0.015; // 1.5%
      const profitToRiskRatio = profitTargetPercentage / riskPercentage;
      
      expect(profitToRiskRatio).toBe(2); // 精确的2:1盈亏比
    });

    it('验证不同价格下的一致性', () => {
      const prices = [1.50, 1.85, 2.20, 3.00];
      const riskPercentage = 0.0075;
      const profitTargetPercentage = 0.015;

      prices.forEach(price => {
        // 多头
        const longStopLoss = calculateStopLossPrice(price, riskPercentage, true);
        const longTakeProfit = calculateTakeProfitPrice(price, profitTargetPercentage, true);
        const longLoss = Math.abs(calculatePnlPercentage(price, longStopLoss, true));
        const longProfit = calculatePnlPercentage(price, longTakeProfit, true);

        expect(longLoss).toBeCloseTo(0.0075, 6);
        expect(longProfit).toBeCloseTo(0.015, 6);

        // 空头
        const shortStopLoss = calculateStopLossPrice(price, riskPercentage, false);
        const shortTakeProfit = calculateTakeProfitPrice(price, profitTargetPercentage, false);
        const shortLoss = Math.abs(calculatePnlPercentage(price, shortStopLoss, false));
        const shortProfit = calculatePnlPercentage(price, shortTakeProfit, false);

        expect(shortLoss).toBeCloseTo(0.0075, 6);
        expect(shortProfit).toBeCloseTo(0.015, 6);
      });
    });
  });

  describe('实际交易场景模拟', () => {
    it('ASTER多头交易场景：$1.85入场', () => {
      const entryPrice = 1.85;
      const positionSize = 20; // 20 ASTER
      const riskPercentage = 0.0075;
      const profitTargetPercentage = 0.015;

      const stopLossPrice = calculateStopLossPrice(entryPrice, riskPercentage, true);
      const takeProfitPrice = calculateTakeProfitPrice(entryPrice, profitTargetPercentage, true);

      // 计算USD损失和收益
      const maxLossUsd = (entryPrice - stopLossPrice) * positionSize;
      const maxProfitUsd = (takeProfitPrice - entryPrice) * positionSize;

      expect(stopLossPrice).toBeCloseTo(1.836125, 6);
      expect(takeProfitPrice).toBeCloseTo(1.87775, 5);
      expect(maxLossUsd).toBeCloseTo(0.2775, 3); // $0.28损失
      expect(maxProfitUsd).toBeCloseTo(0.555, 3); // $0.56收益
      expect(maxProfitUsd / maxLossUsd).toBeCloseTo(2, 1); // 2:1盈亏比
    });

    it('ASTER空头交易场景：$1.85入场', () => {
      const entryPrice = 1.85;
      const positionSize = 20; // 20 ASTER
      const riskPercentage = 0.0075;
      const profitTargetPercentage = 0.015;

      const stopLossPrice = calculateStopLossPrice(entryPrice, riskPercentage, false);
      const takeProfitPrice = calculateTakeProfitPrice(entryPrice, profitTargetPercentage, false);

      // 计算USD损失和收益
      const maxLossUsd = (stopLossPrice - entryPrice) * positionSize;
      const maxProfitUsd = (entryPrice - takeProfitPrice) * positionSize;

      expect(stopLossPrice).toBeCloseTo(1.863875, 6);
      expect(takeProfitPrice).toBeCloseTo(1.82225, 5);
      expect(maxLossUsd).toBeCloseTo(0.2775, 3); // $0.28损失
      expect(maxProfitUsd).toBeCloseTo(0.555, 3); // $0.56收益
      expect(maxProfitUsd / maxLossUsd).toBeCloseTo(2, 1); // 2:1盈亏比
    });
  });
});
