import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  AuthResponse,
  UserData,
  ValidateTokenResponse,
} from './interfaces/auth.interface';
import * as admin from 'firebase-admin';
import axios from 'axios';

@Injectable()
export class AuthService {
  constructor(
    @Inject(FirebaseConfig)
    private readonly firebaseConfig: FirebaseConfig,
    private readonly configService: ConfigService,
  ) {}

  private get auth(): admin.auth.Auth {
    return this.firebaseConfig.getAuth();
  }

  private get firestore(): admin.firestore.Firestore {
    return this.firebaseConfig.getFirestore();
  }

  private async verifyPassword(email: string, password: string): Promise<string> {
    try {
      const apiKey = this.configService.get<string>('FIREBASE_API_KEY');
      if (!apiKey) {
        throw new Error('Firebase API key not configured');
      }

      // Use Firebase REST API to verify password
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          email,
          password,
          returnSecureToken: true,
        },
      );

      return response.data.localId; // Returns the user's UID
    } catch (error) {
      if (error.response?.data?.error?.message) {
        const errorMessage = error.response.data.error.message;
        if (errorMessage.includes('INVALID_PASSWORD') || errorMessage.includes('EMAIL_NOT_FOUND')) {
          throw new UnauthorizedException('Invalid email or password');
        }
      }
      throw new UnauthorizedException('Invalid credentials');
    }
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

  async adminLogin(loginDto: LoginDto): Promise<AuthResponse> {
    try {
      console.log('🔵 [BACKEND] Admin login attempt for:', loginDto.email);

      // First, verify the password using Firebase REST API
      const uid = await this.verifyPassword(loginDto.email, loginDto.password);
      console.log('✅ [BACKEND] Password verified for UID:', uid);
      
      // Check if user exists in admins collection
      const adminDoc = await this.firestore.collection('admins').doc(uid).get();
      
      if (!adminDoc.exists) {
        console.error('❌ [BACKEND] User is not an admin');
        throw new UnauthorizedException('Invalid credentials or insufficient permissions');
      }

      const adminData = adminDoc.data();
      
      if (!adminData || adminData.status !== 'active') {
        console.error('❌ [BACKEND] Admin account is not active');
        throw new UnauthorizedException('Account is not active');
      }

      // Get user record for additional info
      const userRecord = await this.auth.getUser(uid);

      // Create custom token for the admin
      const customToken = await this.auth.createCustomToken(uid, {
        role: 'admin',
      });

      const userData: UserData = {
        uid: userRecord.uid,
        email: userRecord.email || null,
        displayName: userRecord.displayName || null,
        emailVerified: userRecord.emailVerified,
      };

      console.log('✅ [BACKEND] Admin login successful');
      
      return {
        user: userData,
        token: customToken,
      };
    } catch (error) {
      console.error('❌ [BACKEND] Admin login error:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials or insufficient permissions');
    }
  }

  async userLogin(loginDto: LoginDto): Promise<AuthResponse> {
    try {
      console.log('🔵 [BACKEND] User login attempt for:', loginDto.email);

      // First, verify the password using Firebase REST API
      const uid = await this.verifyPassword(loginDto.email, loginDto.password);
      console.log('✅ [BACKEND] Password verified for UID:', uid);
      
      // Check if user exists in users collection
      const userDoc = await this.firestore.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        console.error('❌ [BACKEND] User account not found in users collection');
        throw new UnauthorizedException('Invalid credentials or insufficient permissions');
      }

      // Make sure user is NOT in admins collection
      const adminDoc = await this.firestore.collection('admins').doc(uid).get();
      
      if (adminDoc.exists) {
        console.error('❌ [BACKEND] This is an admin account, cannot login as user');
        throw new UnauthorizedException('Invalid credentials or insufficient permissions');
      }

      const userData = userDoc.data();
      
      if (!userData || userData.status !== 'active') {
        console.error('❌ [BACKEND] User account is not active');
        throw new UnauthorizedException('Account is not active');
      }

      // Get user record for additional info
      const userRecord = await this.auth.getUser(uid);

      // Create custom token for the user
      const customToken = await this.auth.createCustomToken(uid, {
        role: 'user',
      });

      const userResponse: UserData = {
        uid: userRecord.uid,
        email: userRecord.email || null,
        displayName: userRecord.displayName || null,
        emailVerified: userRecord.emailVerified,
      };

      console.log('✅ [BACKEND] User login successful');
      
      return {
        user: userResponse,
        token: customToken,
      };
    } catch (error) {
      console.error('❌ [BACKEND] User login error:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials or insufficient permissions');
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