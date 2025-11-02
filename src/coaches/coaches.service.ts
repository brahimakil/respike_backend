import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { StorageService } from '../storage/storage.service';
import { CreateCoachDto } from './dto/create-coach.dto';
import { UpdateCoachDto } from './dto/update-coach.dto';
import { ReviewCoachDto } from './dto/review-coach.dto';
import { Coach, CoachStatus } from './interfaces/coach.interface';
import * as admin from 'firebase-admin';

@Injectable()
export class CoachesService {
  private firestore: admin.firestore.Firestore;

  constructor(
    @Inject(FirebaseConfig)
    private readonly firebaseConfig: FirebaseConfig,
    private readonly storageService: StorageService,
  ) {
    this.firestore = this.firebaseConfig.getFirestore();
  }

  /**
   * Create a new coach with KYC data
   */
  async createCoach(
    createCoachDto: CreateCoachDto,
    files: {
      profilePhoto: any;
      idFrontPhoto: any;
      idBackPhoto: any;
    },
  ): Promise<Coach> {
    try {
      console.log('🔵 [COACHES] Creating new coach:', createCoachDto.email);

      // Check if coach already exists
      const existingCoaches = await this.firestore
        .collection('coaches')
        .where('email', '==', createCoachDto.email)
        .get();

      if (!existingCoaches.empty) {
        throw new BadRequestException('Coach with this email already exists');
      }

      // Create new coach document
      const coachRef = this.firestore.collection('coaches').doc();
      const coachId = coachRef.id;

      // Upload files to Firebase Storage
      console.log('🔵 [COACHES] Uploading coach documents...');

      const profilePhotoPath = this.storageService.generatePath(
        'coaches',
        'profile-photos',
        `${coachId}-${files.profilePhoto.originalname}`,
      );

      const idFrontPath = this.storageService.generatePath(
        'coaches',
        'id-documents',
        `${coachId}-front-${files.idFrontPhoto.originalname}`,
      );

      const idBackPath = this.storageService.generatePath(
        'coaches',
        'id-documents',
        `${coachId}-back-${files.idBackPhoto.originalname}`,
      );

      const [profilePhotoResult, idFrontResult, idBackResult] =
        await Promise.all([
          this.storageService.uploadFile(
            files.profilePhoto.buffer,
            profilePhotoPath,
            files.profilePhoto.mimetype,
          ),
          this.storageService.uploadFile(
            files.idFrontPhoto.buffer,
            idFrontPath,
            files.idFrontPhoto.mimetype,
          ),
          this.storageService.uploadFile(
            files.idBackPhoto.buffer,
            idBackPath,
            files.idBackPhoto.mimetype,
          ),
        ]);

      console.log('✅ [COACHES] Documents uploaded successfully');

      // Create coach data
      const coachData: Omit<Coach, 'id'> = {
        ...createCoachDto,
        profilePhotoUrl: profilePhotoResult.url,
        idFrontPhotoUrl: idFrontResult.url,
        idBackPhotoUrl: idBackResult.url,
        status: CoachStatus.PENDING,
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await coachRef.set({
        ...coachData,
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [COACHES] Coach created with ID:', coachId);

      return {
        id: coachId,
        ...coachData,
      };
    } catch (error) {
      console.error('❌ [COACHES] Error creating coach:', error);
      throw error;
    }
  }

  /**
   * Get all coaches
   */
  async getAllCoaches(): Promise<Coach[]> {
    try {
      const snapshot = await this.firestore
        .collection('coaches')
        .orderBy('submittedAt', 'desc')
        .get();

      const coaches = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          submittedAt: data?.submittedAt?.toDate(),
          reviewedAt: data?.reviewedAt?.toDate(),
          createdAt: data?.createdAt?.toDate(),
          updatedAt: data?.updatedAt?.toDate(),
        };
      }) as Coach[];

      // Get user count for each coach
      const usersSnapshot = await this.firestore.collection('users').get();
      const coachesWithUserCount = coaches.map(coach => {
        const userCount = usersSnapshot.docs.filter(
          doc => doc.data().assignedCoachId === coach.id
        ).length;
        
        return {
          ...coach,
          userCount,
        };
      });

      return coachesWithUserCount as any;
    } catch (error) {
      console.error('❌ [COACHES] Error fetching coaches:', error);
      throw error;
    }
  }

  /**
   * Get coach by ID
   */
  async getCoachById(id: string): Promise<Coach> {
    try {
      const doc = await this.firestore.collection('coaches').doc(id).get();

      if (!doc.exists) {
        throw new NotFoundException('Coach not found');
      }

      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        submittedAt: data?.submittedAt?.toDate(),
        reviewedAt: data?.reviewedAt?.toDate(),
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
      } as Coach;
    } catch (error) {
      console.error('❌ [COACHES] Error fetching coach:', error);
      throw error;
    }
  }

  /**
   * Update coach information
   */
  async updateCoach(id: string, updateCoachDto: UpdateCoachDto): Promise<Coach> {
    try {
      console.log('🔵 [COACHES] Updating coach:', id);

      const coachRef = this.firestore.collection('coaches').doc(id);
      const coach = await coachRef.get();

      if (!coach.exists) {
        throw new NotFoundException('Coach not found');
      }

      // Filter out undefined values
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      Object.keys(updateCoachDto).forEach((key) => {
        const value = updateCoachDto[key as keyof UpdateCoachDto];
        if (value !== undefined) {
          updateData[key] = value;
        }
      });

      await coachRef.update(updateData);

      console.log('✅ [COACHES] Coach updated successfully');

      return this.getCoachById(id);
    } catch (error) {
      console.error('❌ [COACHES] Error updating coach:', error);
      throw error;
    }
  }

  /**
   * Approve, reject, or move coach back to pending
   */
  async reviewCoach(
    id: string,
    reviewDto: ReviewCoachDto,
    reviewedBy: string,
  ): Promise<Coach> {
    try {
      console.log('🔵 [COACHES] Reviewing coach:', id, reviewDto.status);

      const coachRef = this.firestore.collection('coaches').doc(id);
      const coach = await coachRef.get();

      if (!coach.exists) {
        throw new NotFoundException('Coach not found');
      }

      const updateData: any = {
        status: reviewDto.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // If moving back to pending, clear review data
      if (reviewDto.status === 'pending') {
        updateData.reviewedAt = admin.firestore.FieldValue.delete();
        updateData.reviewedBy = admin.firestore.FieldValue.delete();
        updateData.rejectionReason = admin.firestore.FieldValue.delete();
        updateData.rejectedFields = admin.firestore.FieldValue.delete();
      } else {
        // If approving or rejecting, set review data
        updateData.reviewedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.reviewedBy = reviewedBy;
        
        if (reviewDto.rejectionReason) {
          updateData.rejectionReason = reviewDto.rejectionReason;
        } else {
          // Clear rejection reason if approving
          updateData.rejectionReason = admin.firestore.FieldValue.delete();
        }

        if (reviewDto.rejectedFields && reviewDto.rejectedFields.length > 0) {
          updateData.rejectedFields = reviewDto.rejectedFields;
        } else {
          updateData.rejectedFields = admin.firestore.FieldValue.delete();
        }
      }

      await coachRef.update(updateData);

      console.log('✅ [COACHES] Coach reviewed successfully');

      return this.getCoachById(id);
    } catch (error) {
      console.error('❌ [COACHES] Error reviewing coach:', error);
      throw error;
    }
  }

  /**
   * Ban coach
   */
  async banCoach(id: string, adminId: string, banReason?: string): Promise<Coach> {
    try {
      console.log('🔵 [COACHES] Banning coach:', id);

      const coachRef = this.firestore.collection('coaches').doc(id);
      const coach = await coachRef.get();

      if (!coach.exists) {
        throw new NotFoundException('Coach not found');
      }

      await coachRef.update({
        status: CoachStatus.BANNED,
        banReason: banReason || 'No reason provided',
        bannedBy: adminId,
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: adminId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [COACHES] Coach banned successfully');

      return this.getCoachById(id);
    } catch (error) {
      console.error('❌ [COACHES] Error banning coach:', error);
      throw error;
    }
  }

  /**
   * Unban coach (set back to approved)
   */
  async unbanCoach(id: string, adminId: string): Promise<Coach> {
    try {
      console.log('🔵 [COACHES] Unbanning coach:', id);

      const coachRef = this.firestore.collection('coaches').doc(id);
      const coach = await coachRef.get();

      if (!coach.exists) {
        throw new NotFoundException('Coach not found');
      }

      await coachRef.update({
        status: CoachStatus.APPROVED,
        banReason: admin.firestore.FieldValue.delete(),
        bannedBy: admin.firestore.FieldValue.delete(),
        bannedAt: admin.firestore.FieldValue.delete(),
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: adminId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [COACHES] Coach unbanned successfully');

      return this.getCoachById(id);
    } catch (error) {
      console.error('❌ [COACHES] Error unbanning coach:', error);
      throw error;
    }
  }

  /**
   * Get active users assigned to a coach
   */
  async getCoachActiveUsers(coachId: string): Promise<any[]> {
    try {
      console.log('🔵 [COACHES] Getting active users for coach:', coachId);

      const usersSnapshot = await this.firestore
        .collection('users')
        .where('assignedCoachId', '==', coachId)
        .get();

      const users = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log('✅ [COACHES] Found', users.length, 'users for coach');
      return users;
    } catch (error) {
      console.error('❌ [COACHES] Error getting active users:', error);
      throw error;
    }
  }

  /**
   * Delete coach
   */
  async deleteCoach(id: string): Promise<void> {
    try {
      console.log('🔵 [COACHES] Deleting coach:', id);

      const coach = await this.getCoachById(id);

      // Delete files from storage (continue even if file deletion fails)
      try {
        const deletePromises: Promise<void>[] = [];
        
        if (coach.profilePhotoUrl) {
          const profilePath = this.extractPathFromUrl(coach.profilePhotoUrl);
          if (profilePath) {
            deletePromises.push(
              this.storageService.deleteFile(profilePath).catch(err => {
                console.warn('⚠️ [COACHES] Failed to delete profile photo:', err.message);
              })
            );
          }
        }

        if (coach.idFrontPhotoUrl) {
          const idFrontPath = this.extractPathFromUrl(coach.idFrontPhotoUrl);
          if (idFrontPath) {
            deletePromises.push(
              this.storageService.deleteFile(idFrontPath).catch(err => {
                console.warn('⚠️ [COACHES] Failed to delete ID front photo:', err.message);
              })
            );
          }
        }

        if (coach.idBackPhotoUrl) {
          const idBackPath = this.extractPathFromUrl(coach.idBackPhotoUrl);
          if (idBackPath) {
            deletePromises.push(
              this.storageService.deleteFile(idBackPath).catch(err => {
                console.warn('⚠️ [COACHES] Failed to delete ID back photo:', err.message);
              })
            );
          }
        }

        await Promise.all(deletePromises);
      } catch (storageError) {
        console.warn('⚠️ [COACHES] Storage cleanup had issues:', storageError);
        // Continue with deletion even if storage fails
      }

      // Remove coach assignment from all users
      try {
        const usersSnapshot = await this.firestore
          .collection('users')
          .where('assignedCoachId', '==', id)
          .get();

        if (!usersSnapshot.empty) {
          const batch = this.firestore.batch();
          usersSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
              assignedCoachId: admin.firestore.FieldValue.delete(),
              assignedCoachName: admin.firestore.FieldValue.delete(),
            });
          });
          await batch.commit();
          console.log(`✅ [COACHES] Removed coach assignment from ${usersSnapshot.size} users`);
        }
      } catch (userUpdateError) {
        console.warn('⚠️ [COACHES] Failed to update users:', userUpdateError);
        // Continue with deletion
      }

      // Delete coach document
      await this.firestore.collection('coaches').doc(id).delete();

      console.log('✅ [COACHES] Coach deleted successfully');
    } catch (error) {
      console.error('❌ [COACHES] Error deleting coach:', error);
      throw error;
    }
  }

  /**
   * Extract storage path from Firebase Storage URL
   * Example URL: https://firebasestorage.googleapis.com/v0/b/bucket-name.appspot.com/o/path%2Fto%2Ffile.jpg?alt=media&token=xxx
   * Extract: path/to/file.jpg
   */
  private extractPathFromUrl(url: string): string {
    try {
      if (!url) return '';
      
      // Try to extract from Firebase Storage URL format
      // Format: https://firebasestorage.googleapis.com/v0/b/bucket/o/encoded-path?params
      const match = url.match(/\/o\/([^?]+)/);
      if (match && match[1]) {
        // Decode the URL-encoded path
        const decodedPath = decodeURIComponent(match[1]);
        
        // Remove any leading bucket name or domain if present
        // Expected format: coaches/profile-photos/filename.jpg
        // But we might get: storage.googleapis.com/bucket/coaches/profile-photos/filename.jpg
        const cleanPath = decodedPath.replace(/^.*?(coaches\/)/, '$1');
        return cleanPath;
      }
      
      // Alternative format: direct path extraction from end of URL
      const pathMatch = url.match(/(coaches\/[^?]+)/);
      if (pathMatch && pathMatch[1]) {
        return pathMatch[1];
      }
      
      console.warn('⚠️ [COACHES] Could not extract path from URL:', url);
      return '';
    } catch (error) {
      console.error('❌ [COACHES] Error extracting path from URL:', error);
      return '';
    }
  }
}

