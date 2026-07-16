import { Test, TestingModule } from '@nestjs/testing';
import { RangeResolverService } from './range-resolver.service';
import { RangeQueryDto } from '../../shared/dto/range.schema';
import { BadRequestException } from '@nestjs/common';

describe('RangeResolverService', () => {
  let service: RangeResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RangeResolverService],
    }).compile();

    service = module.get<RangeResolverService>(RangeResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolve', () => {
    it('should throw BadRequestException if range is empty and from/to missing', () => {
      const query = {} as RangeQueryDto;
      expect(() => service.resolve(query, 'UTC')).toThrow(BadRequestException);
    });

    it('should resolve explicitly provided from and to dates', () => {
      const query: RangeQueryDto = { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' } as any;
      const result = service.resolve(query, 'UTC');
      expect(result.from.toISOString()).toBe('2024-01-01T00:00:00.000Z');
      expect(result.to.toISOString()).toBe('2024-01-31T23:59:59.999Z');
    });

    it('should resolve "today" taking timezone into account', () => {
      const query: RangeQueryDto = { range: 'today' } as any;
      
      const resultUTC = service.resolve(query, 'UTC');
      const resultIST = service.resolve(query, 'Asia/Kolkata'); // +05:30
      
      expect(resultUTC.from.getTime()).toBeLessThan(resultUTC.to.getTime());
      expect(resultIST.from.getTime()).toBeLessThan(resultIST.to.getTime());
      
      expect(resultUTC.from).toBeInstanceOf(Date);
      expect(resultIST.from).toBeInstanceOf(Date);
    });
  });
});
