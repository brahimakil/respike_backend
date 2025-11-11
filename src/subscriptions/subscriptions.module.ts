import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { AuthModule } from '../auth/auth.module';
import { WalletsModule } from '../wallets/wallets.module';
import { PaymentsModule } from '../payments/payments.module';
import { ThreePayService } from '../services/threepay.service';

@Module({
  imports: [
    AuthModule, 
    WalletsModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, FirebaseConfig, ThreePayService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}

