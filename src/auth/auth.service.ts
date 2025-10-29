import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  AuthResponse,
  UserData,
  ValidateTokenResponse,
} from './interfaces/auth.interface';
import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
  constructor(
    @Inject(FirebaseConfig)
    private readonly firebaseConfig: FirebaseConfig,
  ) {}

  private get auth(): admin.auth.Auth {
    return this.firebaseConfig.getAuth();
  }

  private get firestore(): admin.firestore.Firestore {
    return this.firebaseConfig.getFirestore();
  }

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    try {
      console.log('🔵 [BACKEND] Starting registration for:', registerDto.email);
      
      // Create user in Firebase Auth
      const userRecord = await this.auth.createUser({
        email: registerDto.email,
        password: registerDto.password,
        displayName: registerDto.displayName,
      });
      console.log('✅ [BACKEND] User created in Firebase Auth:', userRecord.uid);

      // Save admin data to Firestore "admins" collection
      const adminData = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName || null,
        emailVerified: userRecord.emailVerified,
        role: 'admin',
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      console.log('🔵 [BACKEND] Saving to Firestore admins collection...');
      console.log('📋 [BACKEND] Admin data:', JSON.stringify(adminData, null, 2));
      
      const adminDocRef = this.firestore.collection('admins').doc(userRecord.uid);
      await adminDocRef.set(adminData);
      
      console.log('✅ [BACKEND] Admin document set() completed!');
      
      // Verify it was saved
      const savedDoc = await adminDocRef.get();
      if (savedDoc.exists) {
        console.log('✅ [BACKEND] VERIFIED: Admin document exists in Firestore!');
        console.log('📋 [BACKEND] Saved data:', savedDoc.data());
      } else {
        console.error('❌ [BACKEND] ERROR: Admin document NOT found in Firestore!');
      }

      const customToken = await this.auth.createCustomToken(userRecord.uid);
      console.log('✅ [BACKEND] Custom token created');

      const userData: UserData = {
        uid: userRecord.uid,
        email: userRecord.email || null,
        displayName: userRecord.displayName || null,
        emailVerified: userRecord.emailVerified,
        createdAt: new Date(userRecord.metadata.creationTime),
      };

      return {
        user: userData,
        token: customToken,
      };
    } catch (error) {
      console.error('❌ [BACKEND] Registration error:', error);
      if (error.code === 'auth/email-already-exists') {
        throw new BadRequestException('Email already exists');
      }
      throw new BadRequestException(error.message);
    }
  }

  async validateToken(token: string): Promise<ValidateTokenResponse> {
    try {
      const decodedToken = await this.auth.verifyIdToken(token);
      const userRecord = await this.auth.getUser(decodedToken.uid);

      const userData: UserData = {
        uid: userRecord.uid,
        email: userRecord.email || null,
        displayName: userRecord.displayName || null,
        emailVerified: userRecord.emailVerified,
      };

      return {
        valid: true,
        user: userData,
      };
    } catch (error) {
      return {
        valid: false,
      };
    }
  }

  async getUserById(uid: string): Promise<UserData> {
    try {
      const userRecord = await this.auth.getUser(uid);

      return {
        uid: userRecord.uid,
        email: userRecord.email || null,
        displayName: userRecord.displayName || null,
        emailVerified: userRecord.emailVerified,
      };
    } catch (error) {
      throw new UnauthorizedException('User not found');
    }
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      await this.auth.deleteUser(uid);
    } catch (error) {
      throw new BadRequestException('Failed to delete user');
    }
  }

  async updateUser(
    uid: string,
    updates: { email?: string; displayName?: string; password?: string },
  ): Promise<UserData> {
    try {
      const userRecord = await this.auth.updateUser(uid, updates);

      return {
        uid: userRecord.uid,
        email: userRecord.email || null,
        displayName: userRecord.displayName || null,
        emailVerified: userRecord.emailVerified,
      };
    } catch (error) {
      throw new BadRequestException('Failed to update user');
    }
  }
}