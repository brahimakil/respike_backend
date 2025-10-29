import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { FirebaseConfig } from '../../database/firebase/firebase.config';
import { AuthModule } from '../../auth/auth.module';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [VideosController],
  providers: [VideosService, FirebaseConfig],
  exports: [VideosService],
})
export class VideosModule {}

