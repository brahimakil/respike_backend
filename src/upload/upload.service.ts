import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private storage: admin.storage.Storage;

  constructor(@Inject(FirebaseConfig) private firebaseConfig: FirebaseConfig) {
    this.storage = admin.storage();
  }

  async uploadBannerImage(file: Express.Multer.File): Promise<string> {
    try {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException('Only JPEG, PNG, and WebP images are allowed');
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new BadRequestException('File size must be less than 5MB');
      }

      const bucket = this.storage.bucket();
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `banners/banner-${uuidv4()}.${fileExtension}`;
      const fileUpload = bucket.file(fileName);

      await fileUpload.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
        public: true,
      });

      // Get public URL
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

      console.log('✅ [UPLOAD] Banner image uploaded:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('❌ [UPLOAD] Error uploading banner:', error);
      throw error;
    }
  }
}

