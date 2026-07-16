import { Injectable, BadRequestException } from '@nestjs/common';
import { RangeQueryDto } from '../../shared/dto/range.schema';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subYears } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

@Injectable()
export class RangeResolverService {
  resolve(query: RangeQueryDto, userTimezone: string = 'UTC'): { from: Date; to: Date } {
    if (!query.range) {
      if (!query.from || !query.to) {
        throw new BadRequestException('from and to dates are required if range is not provided');
      }
      return {
        from: new Date(query.from),
        to: new Date(query.to),
      };
    }

    const nowUTC = new Date();
    const nowZoned = toZonedTime(nowUTC, userTimezone);
    let fromZoned: Date;
    let toZoned: Date;

    switch (query.range) {
      case 'today':
        fromZoned = startOfDay(nowZoned);
        toZoned = endOfDay(nowZoned);
        break;
      case 'this_week':
        fromZoned = startOfWeek(nowZoned, { weekStartsOn: 1 });
        toZoned = endOfWeek(nowZoned, { weekStartsOn: 1 });
        break;
      case 'this_month':
        fromZoned = startOfMonth(nowZoned);
        toZoned = endOfMonth(nowZoned);
        break;
      case 'this_year':
        fromZoned = startOfYear(nowZoned);
        toZoned = endOfYear(nowZoned);
        break;
      case 'past_1_year':
        fromZoned = startOfDay(subYears(nowZoned, 1));
        toZoned = endOfDay(nowZoned);
        break;
      case 'all_time':
        fromZoned = new Date(1970, 0, 1);
        toZoned = endOfDay(nowZoned);
        break;
      default:
        throw new BadRequestException('Invalid range preset');
    }

    return {
      from: fromZonedTime(fromZoned, userTimezone),
      to: fromZonedTime(toZoned, userTimezone),
    };
  }
}

