import { Test, TestingModule } from '@nestjs/testing';
import { TradesService } from './trades.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TradesService - computeMetrics', () => {
  let service: TradesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradesService,
        {
          provide: PrismaService,
          useValue: {}, // mock if needed, but not required for pure computeMetrics testing
        },
      ],
    }).compile();

    service = module.get<TradesService>(TradesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Long Trades', () => {
    it('should correctly compute PNL for a winning long trade', () => {
      const result = service.computeMetrics(100, 10, 'LONG', 1, 110, null, null);
      expect(result.netPnl).toBe(100); // (110 - 100) * 10 * 1
      expect(result.netPnlBase).toBe(100);
    });

    it('should correctly compute PNL for a losing long trade', () => {
      const result = service.computeMetrics(100, 10, 'LONG', 1, 90, null, null);
      expect(result.netPnl).toBe(-100); // (90 - 100) * 10 * 1
    });
  });

  describe('Short Trades', () => {
    it('should correctly compute PNL for a winning short trade', () => {
      const result = service.computeMetrics(100, 10, 'SHORT', 1, 90, null, null);
      expect(result.netPnl).toBe(100); // (90 - 100) * 10 * -1
    });

    it('should correctly compute PNL for a losing short trade', () => {
      const result = service.computeMetrics(100, 10, 'SHORT', 1, 110, null, null);
      expect(result.netPnl).toBe(-100); // (110 - 100) * 10 * -1
    });
  });

  describe('Risk/Reward Computation', () => {
    it('should correctly calculate Risk/Reward when stopLoss and takeProfit are provided', () => {
      // Entry 100, SL 90, TP 120 -> Risk 10, Reward 20 -> RR 2
      const result = service.computeMetrics(100, 10, 'LONG', 1, null, 90, 120);
      expect(result.plannedRiskReward).toBe(2);
    });

    it('should handle zero risk gracefully (return null if risk is 0)', () => {
      // Entry 100, SL 100, TP 120 -> Risk 0
      const result = service.computeMetrics(100, 10, 'LONG', 1, null, 100, 120);
      expect(result.plannedRiskReward).toBeNull();
    });

    it('should return null if stopLoss is missing', () => {
      const result = service.computeMetrics(100, 10, 'LONG', 1, null, null, 120);
      expect(result.plannedRiskReward).toBeNull();
    });

    it('should return null if takeProfit is missing', () => {
      const result = service.computeMetrics(100, 10, 'LONG', 1, null, 90, null);
      expect(result.plannedRiskReward).toBeNull();
    });
  });

  describe('Base Currency Conversion', () => {
    it('should multiply netPnl by fxToBase to get netPnlBase', () => {
      const result = service.computeMetrics(100, 10, 'LONG', 1.5, 110, null, null);
      expect(result.netPnl).toBe(100);
      expect(result.netPnlBase).toBe(150); // 100 * 1.5
    });
  });
});
