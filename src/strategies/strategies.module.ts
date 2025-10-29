import { Module } from '@nestjs/common';
import { StrategiesController } from './strategies.controller';
import { StrategiesService } from './strategies.service';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { VideosModule } from './videos/videos.module';

@Module({
  imports: [AuthModule, StorageModule, VideosModule],
  controllers: [StrategiesController],
  providers: [StrategiesService, FirebaseConfig],
  exports: [StrategiesService],
})
export class StrategiesModule {}

