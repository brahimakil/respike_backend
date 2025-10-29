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
      let credential: admin.credential.Credential;

      // Prioritize environment variables (for production/Vercel deployment)
      const projectId = this.configService.get('firebase.projectId');
      const privateKey = this.configService.get('firebase.privateKey');
      const clientEmail = this.configService.get('firebase.clientEmail');

      if (projectId && privateKey && clientEmail) {
        // Use environment variables
        credential = admin.credential.cert({
          projectId,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          clientEmail,
        });
        console.log('✅ Firebase Admin initialized with environment variables');
      } else {
        // Fallback to service account file (local development only)
        const serviceAccountPath = join(
          process.cwd(),
          'firebase-service-account.json',
        );

        if (existsSync(serviceAccountPath)) {
          credential = admin.credential.cert(serviceAccountPath);
          console.log('✅ Firebase Admin initialized with service account file');
        } else {
          throw new Error(
            'Firebase credentials not found. Please provide environment variables:\n' +
              '  - FIREBASE_PROJECT_ID\n' +
              '  - FIREBASE_PRIVATE_KEY\n' +
              '  - FIREBASE_CLIENT_EMAIL\n' +
              'Or create firebase-service-account.json in the project root.',
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

