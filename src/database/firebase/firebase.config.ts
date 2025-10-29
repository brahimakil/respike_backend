import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { join } from 'path';
import { existsSync } from 'fs';

@Injectable()
export class FirebaseConfig {
  private firebaseApp: admin.app.App;

  constructor(private configService: ConfigService) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (!admin.apps.length) {
      const serviceAccountPath = join(
        process.cwd(),
        'firebase-service-account.json',
      );

      let credential: admin.credential.Credential;

      // Try to use service account file first
      if (existsSync(serviceAccountPath)) {
        credential = admin.credential.cert(serviceAccountPath);
      } else {
        // Fallback to environment variables
        const projectId = this.configService.get('firebase.projectId');
        const privateKey = this.configService.get('firebase.privateKey');
        const clientEmail = this.configService.get('firebase.clientEmail');

        if (projectId && privateKey && clientEmail) {
          credential = admin.credential.cert({
            projectId,
            privateKey: privateKey.replace(/\\n/g, '\n'),
            clientEmail,
          });
        } else {
          throw new Error(
            'Firebase credentials not found. Please provide either ' +
              'firebase-service-account.json or set environment variables.',
          );
        }
      }

      this.firebaseApp = admin.initializeApp({
        credential,
        storageBucket: this.configService.get('firebase.storageBucket'),
      });
    } else {
      this.firebaseApp = admin.app();
    }
  }

  getFirestore(): admin.firestore.Firestore {
    return admin.firestore();
  }

  getAuth(): admin.auth.Auth {
    return admin.auth();
  }

  getStorage(): admin.storage.Storage {
    return admin.storage();
  }
}

