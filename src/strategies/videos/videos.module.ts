import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { FirebaseConfig } from '../../database/firebase/firebase.config';
import { AuthModule } from '../../auth/auth.module';
import { StorageModule } from '../../storage/storage.module';
import { BunnyService } from '../../services/bunny.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [VideosController],
  providers: [VideosService, FirebaseConfig, BunnyService],
  exports: [VideosService],
})
export class VideosModule {}

