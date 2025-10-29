import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AuthModule } from '../auth/auth.module';
import { FirebaseConfig } from '../database/firebase/firebase.config';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, FirebaseConfig],
  exports: [DashboardService],
})
export class DashboardModule {}

