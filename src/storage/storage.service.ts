import { Injectable } from '@nestjs/common';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import * as admin from 'firebase-admin';

export interface UploadedFile {
  url: string;
  path: string;
  fileName: string;
}

@Injectable()
export class StorageService {
  private storage: admin.storage.Storage;
  private bucket: any; // Firebase Admin SDK Bucket type

  constructor(private firebaseConfig: FirebaseConfig) {
    this.storage = this.firebaseConfig.getStorage();
    this.bucket = this.storage.bucket();
  }

  /**
   * Upload file to Firebase Storage
   * @param file - File buffer
   * @param path - Storage path (e.g., 'coaches/profile-photos/coach-id.jpg')
   * @param contentType - MIME type
   */
  async uploadFile(
    file: Buffer,
    path: string,
    contentType: string,
  ): Promise<UploadedFile> {
    try {
      console.log(`🔵 [STORAGE] Uploading file to: ${path}`);

      const fileRef = this.bucket.file(path);

      await fileRef.save(file, {
        metadata: {
          contentType,
        },
        public: true,
      });

      // Make the file publicly accessible
      await fileRef.makePublic();

      // Get the public URL
      const publicUrl = `https://storage.googleapis.com/${this.bucket.name}/${path}`;

      console.log(`✅ [STORAGE] File uploaded successfully: ${publicUrl}`);

      return {
        url: publicUrl,
        path,
        fileName: path.split('/').pop() || '',
      };
    } catch (error) {
      console.error('❌ [STORAGE] Upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Delete file from Firebase Storage
   */
  async deleteFile(path: string): Promise<void> {
    try {
      console.log(`🔵 [STORAGE] Deleting file: ${path}`);
      await this.bucket.file(path).delete();
      console.log(`✅ [STORAGE] File deleted successfully`);
    } catch (error) {
      console.error('❌ [STORAGE] Delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Generate organized storage paths
   */
  generatePath(
    category: 'coaches' | 'users' | 'admins' | 'strategies',
    subcategory: string,
    fileName: string,
  ): string {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${category}/${subcategory}/${timestamp}-${sanitizedFileName}`;
  }
}

