import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { AuthModule } from '../auth/auth.module';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { WalletsModule } from '../wallets/wallets.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    AuthModule, 
    WalletsModule,
    forwardRef(() => SubscriptionsModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, FirebaseConfig],
  exports: [PaymentsService],
})
export class PaymentsModule {}

