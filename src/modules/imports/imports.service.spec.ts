import { Test, TestingModule } from '@nestjs/testing';
import { ImportsService } from './imports.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TradesService } from '../trades/trades.service';

describe('ImportsService', () => {
  let service: ImportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportsService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: TradesService,
          useValue: {
            computeMetrics: jest.fn().mockReturnValue({
              netPnl: null,
              netPnlBase: null,
              plannedRiskReward: null,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ImportsService>(ImportsService);
  });

  // ─── Dedup Hash ──────────────────────────────────────────

  describe('generateDedupHash', () => {
    it('should produce the same hash for identical inputs', () => {
      const hash1 = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 100, 150.5);
      const hash2 = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 100, 150.5);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different symbols', () => {
      const hash1 = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 100, 150.5);
      const hash2 = service.generateDedupHash('MSFT', '2024-01-15T09:30:00Z', 100, 150.5);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different dates', () => {
      const hash1 = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 100, 150.5);
      const hash2 = service.generateDedupHash('AAPL', '2024-01-16T09:30:00Z', 100, 150.5);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different quantities', () => {
      const hash1 = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 100, 150.5);
      const hash2 = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 200, 150.5);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different prices', () => {
      const hash1 = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 100, 150.5);
      const hash2 = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 100, 160.0);
      expect(hash1).not.toBe(hash2);
    });

    it('should return a 64-char hex string (SHA-256)', () => {
      const hash = service.generateDedupHash('AAPL', '2024-01-15T09:30:00Z', 100, 150.5);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ─── Row Mapping ─────────────────────────────────────────

  describe('mapRow', () => {
    const mapping = {
      Symbol: 'symbol',
      'Entry Price': 'entryPrice',
      'Exit Price': 'exitPrice',
      Qty: 'quantity',
      Direction: 'direction',
      Date: 'openedAt',
    };

    it('should map file columns to trade fields', () => {
      const raw = {
        Symbol: 'AAPL',
        'Entry Price': '150.5',
        'Exit Price': '160.0',
        Qty: '100',
        Direction: 'LONG',
        Date: '2024-01-15T09:30:00Z',
      };

      const { mapped } = service.mapRow(raw, mapping as any, 'INR');
      expect(mapped['symbol']).toBe('AAPL');
      expect(mapped['entryPrice']).toBe(150.5);
      expect(mapped['exitPrice']).toBe(160.0);
      expect(mapped['quantity']).toBe(100);
      expect(mapped['direction']).toBe('LONG');
    });

    it('should default currency to baseCurrency when absent', () => {
      const raw = {
        Symbol: 'AAPL',
        'Entry Price': '150.5',
        Qty: '100',
        Direction: 'LONG',
        Date: '2024-01-15T09:30:00Z',
      };

      const { mapped, notices } = service.mapRow(raw, mapping as any, 'INR');
      expect(mapped['currency']).toBe('INR');
      expect(notices).toContain('Defaulted currency to INR');
    });

    it('should default assetClass to EQUITY when absent', () => {
      const raw = {
        Symbol: 'AAPL',
        'Entry Price': '150.5',
        Qty: '100',
        Direction: 'LONG',
        Date: '2024-01-15T09:30:00Z',
      };

      const { mapped, notices } = service.mapRow(raw, mapping as any, 'INR');
      expect(mapped['assetClass']).toBe('EQUITY');
      expect(notices).toContain('Defaulted assetClass to EQUITY');
    });

    it('should normalize direction to uppercase', () => {
      const raw = {
        Symbol: 'AAPL',
        'Entry Price': '150.5',
        Qty: '100',
        Direction: 'long',
        Date: '2024-01-15T09:30:00Z',
      };

      const { mapped } = service.mapRow(raw, mapping as any, 'INR');
      expect(mapped['direction']).toBe('LONG');
    });

    it('should set nullable fields to null when empty', () => {
      const raw = {
        Symbol: 'AAPL',
        'Entry Price': '150.5',
        'Exit Price': '',
        Qty: '100',
        Direction: 'LONG',
        Date: '2024-01-15T09:30:00Z',
      };

      const { mapped } = service.mapRow(raw, mapping as any, 'INR');
      expect(mapped['exitPrice']).toBeNull();
      expect(mapped['stopLoss']).toBeNull();
      expect(mapped['takeProfit']).toBeNull();
    });
  });

  // ─── CSV Parsing ─────────────────────────────────────────

  describe('parseFile', () => {
    it('should parse a valid CSV buffer', () => {
      const csv =
        'Symbol,Entry Price,Qty,Direction\nAAPL,150.5,100,LONG\nMSFT,300.0,50,SHORT';
      const buffer = Buffer.from(csv, 'utf-8');
      const rows = service.parseFile(buffer, 'test.csv');

      expect(rows).toHaveLength(2);
      expect(rows[0]['Symbol']).toBe('AAPL');
      expect(rows[1]['Symbol']).toBe('MSFT');
    });

    it('should throw on unsupported file type', () => {
      const buffer = Buffer.from('test', 'utf-8');
      expect(() => service.parseFile(buffer, 'test.pdf')).toThrow(
        'Unsupported file format',
      );
    });
  });
});
