import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { StorageService } from '../storage/storage.service';
import { User, UserStatus } from './interfaces/user.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignCoachDto } from './dto/assign-coach.dto';

@Injectable()
export class UsersService {
  private firestore: admin.firestore.Firestore;
  private auth: admin.auth.Auth;

  constructor(
    private firebaseConfig: FirebaseConfig,
    private storageService: StorageService,
  ) {
    this.firestore = this.firebaseConfig.getFirestore();
    this.auth = this.firebaseConfig.getAuth();
  }

  /**
   * Upload profile photo
   */
  async uploadProfilePhoto(file: any, userId: string): Promise<{ photoURL: string }> {
    try {
      console.log('🔵 [USERS] Uploading profile photo for user:', userId);
      console.log('File details:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
      
      // Generate unique filename
      const fileName = `profile_${Date.now()}_${file.originalname}`;
      const storagePath = `users/profiles/${fileName}`;
      
      const result = await this.storageService.uploadFile(
        file.buffer,
        storagePath,
        file.mimetype,
      );

      console.log('✅ [USERS] Profile photo uploaded:', result.url);

      // Update user document in Firestore
      await this.firestore.collection('users').doc(userId).update({
        photoURL: result.url,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update Firebase Auth profile
      await this.auth.updateUser(userId, {
        photoURL: result.url,
      });

      console.log('✅ [USERS] User profile and auth updated with photo URL');

      return { photoURL: result.url };
    } catch (error) {
      console.error('❌ [USERS] Error uploading photo:', error);
      throw error;
    }
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<User[]> {
    try {
      console.log('🔵 [USERS] Fetching all users...');

      const snapshot = await this.firestore.collection('users').get();

      const users = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const data = doc.data();
          const user: any = {
            id: doc.id,
            ...data,
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
          };

          // Auto-fix missing coach names
          if (user.assignedCoachId && (!user.assignedCoachName || user.assignedCoachName === 'Unknown Coach')) {
            console.log(`🔧 [USERS] Fixing missing coach name for user ${user.email}`);
            try {
              const coachDoc = await this.firestore.collection('coaches').doc(user.assignedCoachId).get();
              if (coachDoc.exists) {
                const coachData = coachDoc.data();
                user.assignedCoachName = coachData?.fullName || 'Unknown Coach';
                // Update in Firestore
                await this.firestore.collection('users').doc(doc.id).update({
                  assignedCoachName: user.assignedCoachName,
                });
                console.log(`✅ [USERS] Fixed coach name to: ${user.assignedCoachName}`);
              }
            } catch (error) {
              console.error(`❌ [USERS] Error fixing coach name:`, error);
            }
          }

          return user;
        })
      );

      console.log(`✅ [USERS] Fetched ${users.length} users`);
      return users;
    } catch (error) {
      console.error('❌ [USERS] Error fetching users:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User> {
    try {
      const doc = await this.firestore.collection('users').doc(id).get();

      if (!doc.exists) {
        throw new NotFoundException('User not found');
      }

      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
      } as User;
    } catch (error) {
      console.error('❌ [USERS] Error fetching user:', error);
      throw error;
    }
  }

  /**
   * Create new user
   */
  async createUserProfile(uid: string, email: string, displayName?: string, phoneNumber?: string): Promise<User> {
    try {
      console.log('🔵 [USERS] Creating user profile for:', uid);

      // Create user document in Firestore (user already exists in Firebase Auth)
      const userData: any = {
        uid,
        email,
        displayName: displayName || null,
        phoneNumber: phoneNumber || null,
        photoURL: null,
        status: UserStatus.ACTIVE,
        assignedCoachId: null,
        assignedCoachName: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const userDocRef = this.firestore.collection('users').doc(uid);
      await userDocRef.set(userData);

      console.log('✅ [USERS] User profile created in Firestore');

      return this.getUserById(uid);
    } catch (error: any) {
      console.error('❌ [USERS] Error creating user profile:', error);
      throw new BadRequestException('Failed to create user profile');
    }
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    try {
      console.log('🔵 [USERS] Creating user:', createUserDto.email);

      // Create user in Firebase Auth
      const authData: any = {
        email: createUserDto.email,
        password: createUserDto.password,
      };

      // Only add optional fields if they're not empty
      if (createUserDto.displayName) {
        authData.displayName = createUserDto.displayName;
      }
      if (createUserDto.phoneNumber && createUserDto.phoneNumber.trim()) {
        authData.phoneNumber = createUserDto.phoneNumber;
      }
      if (createUserDto.photoURL) {
        authData.photoURL = createUserDto.photoURL;
      }

      const userRecord = await this.auth.createUser(authData);

      console.log('✅ [USERS] User created in Firebase Auth:', userRecord.uid);

      // Create user document in Firestore
      const userData: any = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: createUserDto.displayName || null,
        phoneNumber: createUserDto.phoneNumber || null,
        photoURL: createUserDto.photoURL || null,
        status: UserStatus.ACTIVE,
        assignedCoachId: null,
        assignedCoachName: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // If coachId is provided, assign the coach
      if (createUserDto.coachId) {
        console.log('🔍 [DEBUG] Looking up coach with ID:', createUserDto.coachId);
        const coachDoc = await this.firestore.collection('coaches').doc(createUserDto.coachId).get();
        if (coachDoc.exists) {
          const coachData = coachDoc.data();
          console.log('🔍 [DEBUG] Coach data:', coachData);
          console.log('🔍 [DEBUG] Coach fullName:', coachData?.fullName);
          userData.assignedCoachId = createUserDto.coachId;
          userData.assignedCoachName = coachData?.fullName || 'Unknown Coach';
          console.log('🔍 [DEBUG] Setting assignedCoachName to:', userData.assignedCoachName);
        } else {
          console.log('❌ [DEBUG] Coach document does not exist!');
        }
      }

      const userDocRef = this.firestore.collection('users').doc(userRecord.uid);
      await userDocRef.set(userData);

      console.log('✅ [USERS] User document created in Firestore');

      return this.getUserById(userRecord.uid);
    } catch (error: any) {
      console.error('❌ [USERS] Error creating user:', error);
      
      // Handle Firebase Auth errors with user-friendly messages
      if (error.code) {
        switch (error.code) {
          case 'auth/email-already-exists':
            throw new BadRequestException('This email is already registered');
          case 'auth/invalid-email':
            throw new BadRequestException('Invalid email address');
          case 'auth/invalid-password':
            throw new BadRequestException('Password must be at least 6 characters');
          case 'auth/invalid-phone-number':
            const message = error.message || error.errorInfo?.message || 'Invalid phone number';
            if (message.includes('TOO_SHORT')) {
              throw new BadRequestException('Phone number is too short. Must be in E.164 format (e.g., +1234567890)');
            } else if (message.includes('E.164')) {
              throw new BadRequestException('Phone number must be in E.164 format (e.g., +1234567890)');
            } else {
              throw new BadRequestException(`Invalid phone number: ${message}`);
            }
          case 'auth/weak-password':
            throw new BadRequestException('Password is too weak');
          default:
            throw new BadRequestException(error.message || 'Failed to create user');
        }
      }
      
      throw new BadRequestException('Failed to create user');
    }
  }

  /**
   * Update user
   */
  async updateUser(userId: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      console.log('🔵 [USERS] Updating user:', userId);

      const userRef = this.firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new NotFoundException('User not found');
      }

      const userData = userDoc.data();

      // Filter out undefined values
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      Object.keys(updateUserDto).forEach((key) => {
        const value = updateUserDto[key as keyof UpdateUserDto];
        if (value !== undefined) {
          updateData[key] = value;
        }
      });

      // Update Firestore
      await userRef.update(updateData);

      // Update Firebase Auth if needed
      if (updateUserDto.displayName !== undefined || updateUserDto.phoneNumber !== undefined || updateUserDto.photoURL !== undefined) {
        const authUpdateData: any = {};
        if (updateUserDto.displayName !== undefined) authUpdateData.displayName = updateUserDto.displayName;
        // Only add phoneNumber if it's not empty
        if (updateUserDto.phoneNumber !== undefined && updateUserDto.phoneNumber && updateUserDto.phoneNumber.trim()) {
          authUpdateData.phoneNumber = updateUserDto.phoneNumber;
        }
        if (updateUserDto.photoURL !== undefined) authUpdateData.photoURL = updateUserDto.photoURL;

        // Only update if there's something to update
        if (Object.keys(authUpdateData).length > 0) {
          await this.auth.updateUser(userData?.uid, authUpdateData);
        }
      }

      console.log('✅ [USERS] User updated successfully');

      return this.getUserById(userId);
    } catch (error: any) {
      console.error('❌ [USERS] Error updating user:', error);
      
      // Handle Firebase Auth errors with user-friendly messages
      if (error.code) {
        switch (error.code) {
          case 'auth/email-already-exists':
            throw new BadRequestException('This email is already registered');
          case 'auth/invalid-email':
            throw new BadRequestException('Invalid email address');
          case 'auth/invalid-phone-number':
            const message = error.message || error.errorInfo?.message || 'Invalid phone number';
            if (message.includes('TOO_SHORT')) {
              throw new BadRequestException('Phone number is too short. Must be in E.164 format (e.g., +1234567890)');
            } else if (message.includes('E.164')) {
              throw new BadRequestException('Phone number must be in E.164 format (e.g., +1234567890)');
            } else {
              throw new BadRequestException(`Invalid phone number: ${message}`);
            }
          case 'auth/user-not-found':
            throw new NotFoundException('User not found');
          default:
            throw new BadRequestException(error.message || 'Failed to update user');
        }
      }
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new BadRequestException('Failed to update user');
    }
  }

  /**
   * Assign coach to user
   */
  async assignCoach(userId: string, assignCoachDto: AssignCoachDto): Promise<User> {
    try {
      console.log('🔵 [USERS] Assigning coach to user:', userId, assignCoachDto.coachId);

      const userRef = this.firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new NotFoundException('User not found');
      }

      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (assignCoachDto.coachId) {
        // Get coach name
        const coachDoc = await this.firestore.collection('coaches').doc(assignCoachDto.coachId).get();
        
        if (!coachDoc.exists) {
          throw new NotFoundException('Coach not found');
        }

        const coachData = coachDoc.data();
        
        console.log('🔍 [DEBUG] Coach data:', coachData);
        console.log('🔍 [DEBUG] Coach fullName:', coachData?.fullName);
        
        updateData.assignedCoachId = assignCoachDto.coachId;
        updateData.assignedCoachName = coachData?.fullName || 'Unknown Coach';
        
        console.log('🔍 [DEBUG] Setting assignedCoachName to:', updateData.assignedCoachName);
      } else {
        // Remove coach assignment
        updateData.assignedCoachId = admin.firestore.FieldValue.delete();
        updateData.assignedCoachName = admin.firestore.FieldValue.delete();
      }

      await userRef.update(updateData);

      console.log('✅ [USERS] Coach assigned successfully');

      return this.getUserById(userId);
    } catch (error) {
      console.error('❌ [USERS] Error assigning coach:', error);
      throw error;
    }
  }

  /**
   * Ban user
   */
  async banUser(userId: string, banReason?: string): Promise<User> {
    try {
      console.log('🔵 [USERS] Banning user:', userId);

      const userRef = this.firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new NotFoundException('User not found');
      }

      // Disable user in Firebase Auth
      const userData = userDoc.data();
      await this.auth.updateUser(userData?.uid, { disabled: true });

      // Update user status in Firestore
      await userRef.update({
        status: UserStatus.BANNED,
        banReason: banReason || 'No reason provided',
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [USERS] User banned successfully');

      return this.getUserById(userId);
    } catch (error) {
      console.error('❌ [USERS] Error banning user:', error);
      throw error;
    }
  }

  /**
   * Unban user
   */
  async unbanUser(userId: string): Promise<User> {
    try {
      console.log('🔵 [USERS] Unbanning user:', userId);

      const userRef = this.firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new NotFoundException('User not found');
      }

      // Enable user in Firebase Auth
      const userData = userDoc.data();
      await this.auth.updateUser(userData?.uid, { disabled: false });

      // Update user status in Firestore and clear ban reason
      await userRef.update({
        status: UserStatus.ACTIVE,
        banReason: admin.firestore.FieldValue.delete(),
        bannedAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [USERS] User unbanned successfully');

      return this.getUserById(userId);
    } catch (error) {
      console.error('❌ [USERS] Error unbanning user:', error);
      throw error;
    }
  }

  /**
   * Update user's coach commission override
   */
  async updateUserCommission(
    userId: string,
    coachCommissionOverride?: number | null,
  ): Promise<User> {
    try {
      console.log(`🔵 [USERS] Updating commission for user ${userId}:`, coachCommissionOverride);

      const userRef = this.firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new NotFoundException('User not found');
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (coachCommissionOverride === null || coachCommissionOverride === undefined) {
        // Remove override (use coach's default)
        updateData.coachCommissionOverride = admin.firestore.FieldValue.delete();
      } else {
        // Set override
        updateData.coachCommissionOverride = coachCommissionOverride;
      }

      await userRef.update(updateData);

      console.log(`✅ [USERS] Commission updated successfully`);

      return this.getUserById(userId);
    } catch (error) {
      console.error('❌ [USERS] Error updating user commission:', error);
      throw error;
    }
  }

  /**
   * Get active subscriptions for a user
   */
  async getUserActiveSubscriptions(userId: string): Promise<any[]> {
    try {
      console.log(`🔵 [USERS] Fetching active subscriptions for user: ${userId}`);

      const snapshot = await this.firestore
        .collection('subscriptions')
        .where('userId', '==', userId)
        .get();

      const subscriptions = snapshot.docs
        .filter(doc => {
          const status = doc.data().status;
          return status === 'active' || status === 'ACTIVE';
        })
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            startDate: data?.startDate?.toDate(),
            endDate: data?.endDate?.toDate(),
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
          };
        });

      console.log(`✅ [USERS] Found ${subscriptions.length} active subscriptions`);
      return subscriptions;
    } catch (error) {
      console.error('❌ [USERS] Error fetching active subscriptions:', error);
      throw error;
    }
  }

  /**
   * Delete user permanently (from Firestore and Firebase Auth)
   */
  async deleteUser(userId: string): Promise<{ message: string }> {
    try {
      console.log(`🔵 [USERS] Deleting user: ${userId}`);

      // Check if user exists
      const userDoc = await this.firestore.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new NotFoundException('User not found');
      }

      // Delete all user's subscriptions
      const subscriptionsSnapshot = await this.firestore
        .collection('subscriptions')
        .where('userId', '==', userId)
        .get();

      const batch = this.firestore.batch();
      subscriptionsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`✅ [USERS] Deleted ${subscriptionsSnapshot.size} subscriptions`);

      // Delete user from Firestore
      await this.firestore.collection('users').doc(userId).delete();
      console.log(`✅ [USERS] Deleted user from Firestore`);

      // Delete user from Firebase Auth
      await this.auth.deleteUser(userId);
      console.log(`✅ [USERS] Deleted user from Firebase Auth`);

      return { message: 'User deleted successfully' };
    } catch (error) {
      console.error('❌ [USERS] Error deleting user:', error);
      throw error;
    }
  }
}

