import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { TradesModule } from '../trades/trades.module';

@Module({
  imports: [TradesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
