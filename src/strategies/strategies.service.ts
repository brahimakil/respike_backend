import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { Strategy, CreateStrategyDto, UpdateStrategyDto } from './interfaces/strategy.interface';

@Injectable()
export class StrategiesService {
  private firestore: admin.firestore.Firestore;

  constructor(private firebaseConfig: FirebaseConfig) {
    this.firestore = this.firebaseConfig.getFirestore();
  }

  /**
   * Get next strategy number
   */
  private async getNextStrategyNumber(): Promise<number> {
    try {
      const snapshot = await this.firestore
        .collection('strategies')
        .orderBy('number', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return 1;
      }

      const lastStrategy = snapshot.docs[0].data();
      return (lastStrategy?.number || 0) + 1;
    } catch (error) {
      console.error('❌ [STRATEGIES] Error getting next number:', error);
      return 1;
    }
  }

  /**
   * Create a new strategy
   */
  async createStrategy(createStrategyDto: CreateStrategyDto): Promise<Strategy> {
    try {
      console.log('🔵 [STRATEGIES] Creating strategy:', createStrategyDto);

      const nextNumber = await this.getNextStrategyNumber();

      const strategyData = {
        ...createStrategyDto,
        number: nextNumber,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await this.firestore.collection('strategies').add(strategyData);

      console.log('✅ [STRATEGIES] Strategy created:', docRef.id);

      return this.getStrategyById(docRef.id);
    } catch (error) {
      console.error('❌ [STRATEGIES] Error creating strategy:', error);
      throw error;
    }
  }

  /**
   * Get all strategies
   */
  async getAllStrategies(): Promise<Strategy[]> {
    try {
      const snapshot = await this.firestore
        .collection('strategies')
        .orderBy('number', 'asc')
        .get();

      const strategies = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const data = doc.data();
          
          // Get video count for this strategy
          const videosSnapshot = await this.firestore
            .collection('strategyVideos')
            .where('strategyId', '==', doc.id)
            .get();
          
          return {
            id: doc.id,
            ...data,
            videoCount: videosSnapshot.size,
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
          };
        }),
      );

      return strategies as Strategy[];
    } catch (error) {
      console.error('❌ [STRATEGIES] Error fetching strategies:', error);
      throw error;
    }
  }

  /**
   * Get strategy by ID
   */
  async getStrategyById(id: string): Promise<Strategy> {
    try {
      const doc = await this.firestore.collection('strategies').doc(id).get();

      if (!doc.exists) {
        throw new NotFoundException('Strategy not found');
      }

      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
      } as Strategy;
    } catch (error) {
      console.error('❌ [STRATEGIES] Error fetching strategy:', error);
      throw error;
    }
  }

  /**
   * Update strategy
   */
  async updateStrategy(
    id: string,
    updateStrategyDto: UpdateStrategyDto,
  ): Promise<Strategy> {
    try {
      console.log('🔵 [STRATEGIES] Updating strategy:', id);

      const strategyRef = this.firestore.collection('strategies').doc(id);
      const strategy = await strategyRef.get();

      if (!strategy.exists) {
        throw new NotFoundException('Strategy not found');
      }

      // Check if number is being updated and validate uniqueness
      if (updateStrategyDto.number !== undefined) {
        const currentData = strategy.data();
        
        // Only check for duplicates if the number is actually changing
        if (currentData?.number !== updateStrategyDto.number) {
          const existingStrategy = await this.firestore
            .collection('strategies')
            .where('number', '==', updateStrategyDto.number)
            .get();

          if (!existingStrategy.empty) {
            throw new BadRequestException(
              `Strategy number ${updateStrategyDto.number} is already in use. Please choose a different number.`,
            );
          }
        }
      }

      // Filter out undefined values
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      Object.keys(updateStrategyDto).forEach((key) => {
        const value = updateStrategyDto[key as keyof UpdateStrategyDto];
        if (value !== undefined) {
          updateData[key] = value;
        }
      });

      await strategyRef.update(updateData);

      console.log('✅ [STRATEGIES] Strategy updated successfully');

      return this.getStrategyById(id);
    } catch (error) {
      console.error('❌ [STRATEGIES] Error updating strategy:', error);
      throw error;
    }
  }

  /**
   * Delete strategy
   */
  async deleteStrategy(id: string): Promise<void> {
    try {
      console.log('🔵 [STRATEGIES] Deleting strategy:', id);

      const strategyRef = this.firestore.collection('strategies').doc(id);
      const strategy = await strategyRef.get();

      if (!strategy.exists) {
        throw new NotFoundException('Strategy not found');
      }

      await strategyRef.delete();

      console.log('✅ [STRATEGIES] Strategy deleted successfully');
    } catch (error) {
      console.error('❌ [STRATEGIES] Error deleting strategy:', error);
      throw error;
    }
  }

  /**
   * Get all users subscribed to a specific strategy
   */
  async getStrategyUsers(strategyId: string): Promise<any[]> {
    try {
      console.log('🔵 [STRATEGIES] Fetching users for strategy:', strategyId);

      // Get all subscriptions for this strategy
      const subscriptionsSnapshot = await this.firestore
        .collection('subscriptions')
        .where('strategyId', '==', strategyId)
        .get();

      if (subscriptionsSnapshot.empty) {
        return [];
      }

      // Fetch user and coach details for each subscription
      const usersPromises = subscriptionsSnapshot.docs.map(async (doc) => {
        const subscription = doc.data();
        
        // Get user data first (coach info is stored in user document)
        let coachData: any = null;
        let coachId: string | null = null;
        let coachCommissionPercentage: number | undefined = undefined;

        console.log('🔍 [STRATEGIES] Processing subscription for user:', subscription.userId);

        if (subscription.userId) {
          const userDoc = await this.firestore.collection('users').doc(subscription.userId).get();
          console.log('👤 [STRATEGIES] User doc exists:', userDoc.exists);
          
          if (userDoc.exists) {
            const userData: any = userDoc.data();
            coachId = userData?.assignedCoachId;
            console.log('🎯 [STRATEGIES] User assigned coach ID:', coachId);

            // Get coach details if user has an assigned coach
            if (coachId) {
              const coachDoc = await this.firestore.collection('coaches').doc(coachId).get();
              console.log('👨‍🏫 [STRATEGIES] Coach doc exists:', coachDoc.exists);
              
              if (coachDoc.exists) {
                coachData = coachDoc.data();
                
                // Check for user-specific commission override first
                if (userData?.coachCommissionOverride !== undefined && userData?.coachCommissionOverride !== null) {
                  coachCommissionPercentage = userData.coachCommissionOverride;
                  console.log('💰 [STRATEGIES] Using user override commission:', coachCommissionPercentage);
                } else if (coachData?.defaultCommissionPercentage !== undefined && coachData?.defaultCommissionPercentage !== null) {
                  coachCommissionPercentage = coachData.defaultCommissionPercentage;
                  console.log('💰 [STRATEGIES] Using coach default commission:', coachCommissionPercentage);
                } else {
                  coachCommissionPercentage = 30; // Default fallback
                  console.log('⚠️ [STRATEGIES] No commission found, using fallback (30%)');
                }
              } else {
                console.log('❌ [STRATEGIES] Coach document not found for ID:', coachId);
              }
            } else {
              console.log('ℹ️ [STRATEGIES] User has no assigned coach');
            }
          } else {
            console.log('❌ [STRATEGIES] User document not found for ID:', subscription.userId);
          }
        }

        // Calculate progress percentage
        const completedVideosArray = subscription.completedVideos || [];
        const completedCount = Array.isArray(completedVideosArray) ? completedVideosArray.length : 0;
        const totalCount = subscription.totalVideos || 0;
        const calculatedProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        return {
          id: doc.id,
          userId: subscription.userId,
          userName: subscription.userName || 'Unknown',
          userEmail: subscription.userEmail || 'N/A',
          coachId: subscription.coachId,
          coachName: coachData?.fullName || 'No Coach',
          coachEmail: coachData?.email || 'N/A',
          coachCommissionPercentage,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          progressPercentage: calculatedProgress,
          completedVideos: completedCount,
          totalVideos: totalCount,
        };
      });

      const users = await Promise.all(usersPromises);

      console.log(`✅ [STRATEGIES] Found ${users.length} users for strategy`);
      return users;
    } catch (error) {
      console.error('❌ [STRATEGIES] Error fetching strategy users:', error);
      throw error;
    }
  }
}

