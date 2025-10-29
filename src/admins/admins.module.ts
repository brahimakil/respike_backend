import { Module } from '@nestjs/common';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';
import { AuthModule } from '../auth/auth.module';
import { FirebaseConfig } from '../database/firebase/firebase.config';

@Module({
  imports: [AuthModule],
  controllers: [AdminsController],
  providers: [AdminsService, FirebaseConfig],
  exports: [AdminsService],
})
export class AdminsModule {}






