import { describe, it, expect, vi, beforeEach } from "vitest";
import { shouldTakeProfitByPercentage, type PositionSnapshot } from "../src/utils/strategy.js";

describe("百分比止盈测试", () => {
  describe("shouldTakeProfitByPercentage", () => {
    it("多头持仓：价格从 $30000 到 $30450 (1.5% 利润) 应该触发止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: 0.001, // 0.001 BTC 多头
        entryPrice: 30000,
        unrealizedProfit: 0.45, // (30450 - 30000) * 0.001
        markPrice: 30450,
      };
      const currentPrice = 30450; // 1.5% profit
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(true);
    });

    it("多头持仓：价格从 $30000 到 $30300 (1.0% 利润) 不应该触发 1.5% 止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: 0.001, // 0.001 BTC 多头
        entryPrice: 30000,
        unrealizedProfit: 0.3, // (30300 - 30000) * 0.001
        markPrice: 30300,
      };
      const currentPrice = 30300; // 1.0% profit
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(false);
    });

    it("多头持仓：价格从 $30000 到 $30750 (2.5% 利润) 应该触发 1.5% 止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: 0.001, // 0.001 BTC 多头
        entryPrice: 30000,
        unrealizedProfit: 0.75, // (30750 - 30000) * 0.001
        markPrice: 30750,
      };
      const currentPrice = 30750; // 2.5% profit
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(true);
    });

    it("空头持仓：价格从 $30000 到 $29550 (1.5% 利润) 应该触发止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: -0.001, // 0.001 BTC 空头
        entryPrice: 30000,
        unrealizedProfit: 0.45, // (30000 - 29550) * 0.001
        markPrice: 29550,
      };
      const currentPrice = 29550; // 1.5% profit for short
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(true);
    });

    it("空头持仓：价格从 $30000 到 $29700 (1.0% 利润) 不应该触发 1.5% 止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: -0.001, // 0.001 BTC 空头
        entryPrice: 30000,
        unrealizedProfit: 0.3, // (30000 - 29700) * 0.001
        markPrice: 29700,
      };
      const currentPrice = 29700; // 1.0% profit for short
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(false);
    });

    it("空头持仓：价格从 $30000 到 $29250 (2.5% 利润) 应该触发 1.5% 止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: -0.001, // 0.001 BTC 空头
        entryPrice: 30000,
        unrealizedProfit: 0.75, // (30000 - 29250) * 0.001
        markPrice: 29250,
      };
      const currentPrice = 29250; // 2.5% profit for short
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(true);
    });

    it("无持仓时不应该触发止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: 0, // 无持仓
        entryPrice: 30000,
        unrealizedProfit: 0,
        markPrice: 30750,
      };
      const currentPrice = 30750; // 2.5% profit
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(false);
    });

    it("多头持仓价格下跌时不应该触发止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: 0.001, // 0.001 BTC 多头
        entryPrice: 30000,
        unrealizedProfit: -0.3, // (29700 - 30000) * 0.001
        markPrice: 29700,
      };
      const currentPrice = 29700; // -1.0% loss
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(false);
    });

    it("空头持仓价格上涨时不应该触发止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: -0.001, // 0.001 BTC 空头
        entryPrice: 30000,
        unrealizedProfit: -0.3, // (30000 - 30300) * (-0.001)
        markPrice: 30300,
      };
      const currentPrice = 30300; // -1.0% loss for short
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(false);
    });

    it("边界情况：刚好达到 1.5% 利润阈值", () => {
      const position: PositionSnapshot = {
        positionAmt: 0.001, // 0.001 BTC 多头
        entryPrice: 30000,
        unrealizedProfit: 0.45, // (30450 - 30000) * 0.001
        markPrice: 30450,
      };
      const currentPrice = 30450; // exactly 1.5% profit
      const profitPercentage = 0.015; // 1.5% 止盈阈值

      const result = shouldTakeProfitByPercentage(position, currentPrice, profitPercentage);
      expect(result).toBe(true);
    });

    it("用户场景：利润从 1.5% 跳到 2.5% 都应该触发止盈", () => {
      const position: PositionSnapshot = {
        positionAmt: 0.001, // 0.001 BTC 多头
        entryPrice: 30000,
        unrealizedProfit: 0,
        markPrice: 30000,
      };
      const profitPercentage = 0.015; // 1.5% 止盈阈值
      
      // 1.5% 利润点
      const price15 = 30450;
      position.markPrice = price15;
      position.unrealizedProfit = 0.45;
      const result15 = shouldTakeProfitByPercentage(position, price15, profitPercentage);
      expect(result15).toBe(true);
      
      // 2.5% 利润点  
      const price25 = 30750;
      position.markPrice = price25;
      position.unrealizedProfit = 0.75;
      const result25 = shouldTakeProfitByPercentage(position, price25, profitPercentage);
      expect(result25).toBe(true);
    });
  });
});
