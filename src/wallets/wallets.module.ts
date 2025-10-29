import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WalletsController],
  providers: [WalletsService, FirebaseConfig],
  exports: [WalletsService],
})
export class WalletsModule {}

