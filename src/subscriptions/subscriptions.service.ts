import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { WalletsService } from '../wallets/wallets.service';
import { PaymentsService } from '../payments/payments.service';
import {
  Subscription,
  SubscriptionStatus,
  VideoProgress,
  CreateSubscriptionDto,
  RenewSubscriptionDto,
  UpdateVideoProgressDto,
} from './interfaces/subscription.interface';

@Injectable()
export class SubscriptionsService {
  private firestore: admin.firestore.Firestore;

  constructor(
    @Inject(FirebaseConfig) private firebaseConfig: FirebaseConfig,
    @Inject(WalletsService) private walletsService: WalletsService,
    @Inject(forwardRef(() => PaymentsService)) private paymentsService: PaymentsService,
  ) {
    this.firestore = this.firebaseConfig.getFirestore();
  }

  /**
   * Create a new subscription
   */
  async createSubscription(createSubscriptionDto: CreateSubscriptionDto): Promise<Subscription> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Creating subscription:', createSubscriptionDto);

      // Check if user already has an active or pending subscription
      const existingActiveSubscription = await this.getActiveSubscriptionByUserId(createSubscriptionDto.userId);
      if (existingActiveSubscription) {
        throw new BadRequestException('User already has an active subscription. Only one strategy subscription allowed at a time. Please renew the existing subscription instead.');
      }

      // Also check for pending subscriptions
      const pendingSnapshot = await this.firestore
        .collection('subscriptions')
        .where('userId', '==', createSubscriptionDto.userId)
        .where('status', '==', SubscriptionStatus.PENDING)
        .limit(1)
        .get();

      if (!pendingSnapshot.empty) {
        throw new BadRequestException('User has a pending subscription that needs renewal. Please renew the existing subscription instead of creating a new one.');
      }

      // Get user details
      const userDoc = await this.firestore.collection('users').doc(createSubscriptionDto.userId).get();
      if (!userDoc.exists) {
        throw new NotFoundException('User not found');
      }
      const userData = userDoc.data();

      // Get strategy details
      const strategyDoc = await this.firestore.collection('strategies').doc(createSubscriptionDto.strategyId).get();
      if (!strategyDoc.exists) {
        throw new NotFoundException('Strategy not found');
      }
      const strategyData = strategyDoc.data();

      // Get all videos for this strategy
      const videosSnapshot = await this.firestore
        .collection('strategyVideos')
        .where('strategyId', '==', createSubscriptionDto.strategyId)
        .orderBy('order', 'asc')
        .get();

      const totalVideos = videosSnapshot.size;
      const videoProgress: VideoProgress[] = videosSnapshot.docs.map((doc) => ({
        videoId: doc.id,
        videoTitle: doc.data().title,
        videoOrder: doc.data().order,
        isCompleted: false,
      }));

      // Calculate dates
      const duration = createSubscriptionDto.duration || 30;
      const startDate = new Date();
      const endDate = new Date(startDate);
      // Use milliseconds for precise duration (supports fractional days for testing)
      endDate.setTime(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

      // Calculate amount paid
      const amountPaid = createSubscriptionDto.amountPaid ?? strategyData?.price ?? 0;

      const subscriptionData = {
        userId: createSubscriptionDto.userId,
        userName: userData?.displayName || 'Unknown',
        userEmail: userData?.email || '',
        strategyId: createSubscriptionDto.strategyId,
        strategyName: strategyData?.name || 'Unknown Strategy',
        strategyNumber: strategyData?.number || 0,
        strategyPrice: strategyData?.price || 0,
        status: SubscriptionStatus.ACTIVE,
        startDate: admin.firestore.Timestamp.fromDate(startDate),
        endDate: admin.firestore.Timestamp.fromDate(endDate),
        duration,
        videoProgress,
        completedVideos: [], // Array of completed video IDs
        totalVideos,
        progressPercentage: 0,
        currentVideoId: videoProgress[0]?.videoId || null,
        amountPaid,
        renewalCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await this.firestore.collection('subscriptions').add(subscriptionData);

      console.log('✅ [SUBSCRIPTIONS] Subscription created:', docRef.id);

      // Process payment with commission split (if user has a coach)
      const coachId = userData?.assignedCoachId;
      const coachName = userData?.assignedCoachName;
      const commissionPercentage = createSubscriptionDto.coachCommissionPercentage ?? 30; // Default 30%

      await this.walletsService.processSubscriptionPayment(
        docRef.id,
        createSubscriptionDto.userId,
        subscriptionData.userName,
        subscriptionData.strategyName,
        amountPaid,
        coachId,
        coachName,
        commissionPercentage,
      );

      return this.getSubscriptionById(docRef.id);
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Get all subscriptions (with video progress)
   */
  async getAllSubscriptions(): Promise<Subscription[]> {
    try {
      const snapshot = await this.firestore
        .collection('subscriptions')
        .orderBy('createdAt', 'desc')
        .get();

      // Map subscriptions and enrich with video progress
      const subscriptions = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const baseSubscription = this.mapSubscription(doc);
          
          // Get video count for strategy
          try {
            const videosSnapshot = await this.firestore
              .collection('strategyVideos')
              .where('strategyId', '==', baseSubscription.strategyId)
              .where('isVisible', '==', true)
              .get();
            
            const totalVideos = videosSnapshot.size;
            const completedVideosArray = baseSubscription.completedVideos || [];
            const completedCount = Array.isArray(completedVideosArray) ? completedVideosArray.length : 0;
            const progressPercentage = totalVideos > 0 ? Math.round((completedCount / totalVideos) * 100) : 0;
            
            return {
              ...baseSubscription,
              completedVideos: completedCount, // Return count, not array, for admin panel
              totalVideos,
              progressPercentage,
            } as any; // Cast to any to allow for admin panel format
          } catch (error) {
            return {
              ...baseSubscription,
              completedVideos: 0, // Return count for admin panel
              totalVideos: 0,
              progressPercentage: 0,
            } as any;
          }
        })
      );

      return subscriptions as Subscription[];
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error fetching subscriptions:', error);
      throw error;
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscriptionById(id: string): Promise<Subscription> {
    try {
      const doc = await this.firestore.collection('subscriptions').doc(id).get();

      if (!doc.exists) {
        throw new NotFoundException('Subscription not found');
      }

      return this.mapSubscription(doc);
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error fetching subscription:', error);
      throw error;
    }
  }

  /**
   * Get active subscription for a user
   */
  async getActiveSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    try {
      const snapshot = await this.firestore
        .collection('subscriptions')
        .where('userId', '==', userId)
        .where('status', '==', SubscriptionStatus.ACTIVE)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return this.mapSubscription(snapshot.docs[0]);
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error fetching active subscription:', error);
      throw error;
    }
  }

  /**
   * Get current subscription (active OR pending) by user ID for user dashboard
   */
  async getCurrentSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    try {
      const snapshot = await this.firestore
        .collection('subscriptions')
        .where('userId', '==', userId)
        .where('status', 'in', [SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING])
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return this.mapSubscription(snapshot.docs[0]);
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error fetching current subscription:', error);
      throw error;
    }
  }

  /**
   * Renew subscription (or upgrade/downgrade strategy)
   */
  async renewSubscription(id: string, renewDto: RenewSubscriptionDto): Promise<Subscription> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Renewing subscription:', id);

      const subscription = await this.getSubscriptionById(id);
      
      if (subscription.status === SubscriptionStatus.CANCELLED) {
        throw new BadRequestException('Cannot renew a cancelled subscription');
      }

      const duration = renewDto.duration || 30;
      const startDate = new Date();
      const endDate = new Date(startDate);
      // Use milliseconds for precise duration (supports fractional days for testing)
      endDate.setTime(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

      // Use custom amount if provided by admin, otherwise default to $100
      let amountPaid = renewDto.customAmount !== undefined ? renewDto.customAmount : 100;
      let strategyId = subscription.strategyId;
      let strategyName = subscription.strategyName;
      let strategyNumber = subscription.strategyNumber;
      let strategyPrice = subscription.strategyPrice;
      let previousStrategyId = subscription.strategyId;
      let previousStrategyPrice = subscription.strategyPrice;

      // If switching to a new strategy
      if (renewDto.newStrategyId && renewDto.newStrategyId !== subscription.strategyId) {
        const newStrategyDoc = await this.firestore.collection('strategies').doc(renewDto.newStrategyId).get();
        if (!newStrategyDoc.exists) {
          throw new NotFoundException('New strategy not found');
        }
        const newStrategyData = newStrategyDoc.data();

        strategyId = renewDto.newStrategyId;
        strategyName = newStrategyData?.name || 'Unknown Strategy';
        strategyNumber = newStrategyData?.number || 0;
        strategyPrice = newStrategyData?.price || 0;

        // Calculate difference
        const priceDifference = strategyPrice - subscription.strategyPrice;
        amountPaid = priceDifference > 0 ? priceDifference : 0;

        // Get videos for new strategy
        const videosSnapshot = await this.firestore
          .collection('strategyVideos')
          .where('strategyId', '==', renewDto.newStrategyId)
          .orderBy('order', 'asc')
          .get();

        const totalVideos = videosSnapshot.size;
        const videoProgress: VideoProgress[] = videosSnapshot.docs.map((doc) => ({
          videoId: doc.id,
          videoTitle: doc.data().title,
          videoOrder: doc.data().order,
          isCompleted: false,
        }));

        // Update with new strategy
        await this.firestore.collection('subscriptions').doc(id).update({
          strategyId,
          strategyName,
          strategyNumber,
          strategyPrice,
          previousStrategyId,
          previousStrategyPrice,
          status: SubscriptionStatus.ACTIVE,
          startDate: admin.firestore.Timestamp.fromDate(startDate),
          endDate: admin.firestore.Timestamp.fromDate(endDate),
          duration,
          videoProgress,
          completedVideos: [], // Reset to empty array for new strategy
          totalVideos,
          progressPercentage: 0,
          currentVideoId: videoProgress[0]?.videoId || null,
          amountPaid,
          renewalCount: (subscription.renewalCount || 0) + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Same strategy renewal
        await this.firestore.collection('subscriptions').doc(id).update({
          status: SubscriptionStatus.ACTIVE,
          startDate: admin.firestore.Timestamp.fromDate(startDate),
          endDate: admin.firestore.Timestamp.fromDate(endDate),
          duration,
          amountPaid,
          renewalCount: (subscription.renewalCount || 0) + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      console.log('✅ [SUBSCRIPTIONS] Subscription renewed');

      // Process payment with commission split (if user has a coach)
      const userDoc = await this.firestore.collection('users').doc(subscription.userId).get();
      const userData = userDoc.data();
      const coachId = userData?.assignedCoachId;
      const coachName = userData?.assignedCoachName;
      const commissionPercentage = 30; // Default 30% for renewals

      await this.walletsService.processSubscriptionPayment(
        id,
        subscription.userId,
        subscription.userName,
        strategyName,
        amountPaid,
        coachId,
        coachName,
        commissionPercentage,
      );

      return this.getSubscriptionById(id);
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error renewing subscription:', error);
      throw error;
    }
  }

  /**
   * Update video progress
   */
  async updateVideoProgress(id: string, progressDto: UpdateVideoProgressDto): Promise<Subscription> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Updating video progress:', id);

      const subscription = await this.getSubscriptionById(id);

      // Find the video in progress array
      const videoIndex = subscription.videoProgress.findIndex((v) => v.videoId === progressDto.videoId);
      if (videoIndex === -1) {
        throw new NotFoundException('Video not found in subscription');
      }

      // Check if trying to complete a video out of order
      if (progressDto.isCompleted && videoIndex > 0) {
        const previousVideo = subscription.videoProgress[videoIndex - 1];
        if (!previousVideo.isCompleted) {
          throw new BadRequestException('Must complete previous videos before this one');
        }
      }

      // Update video progress
      const updatedProgress = [...subscription.videoProgress];
      updatedProgress[videoIndex] = {
        ...updatedProgress[videoIndex],
        isCompleted: progressDto.isCompleted,
        completedAt: progressDto.isCompleted ? new Date() : undefined,
      };

      // Calculate stats
      const completedVideos = updatedProgress.filter((v) => v.isCompleted).length;
      const progressPercentage = Math.round((completedVideos / subscription.totalVideos) * 100);

      // Find next video to watch
      let currentVideoId: string | null = null;
      const nextIncompleteVideo = updatedProgress.find((v) => !v.isCompleted);
      if (nextIncompleteVideo) {
        currentVideoId = nextIncompleteVideo.videoId;
      }

      await this.firestore.collection('subscriptions').doc(id).update({
        videoProgress: updatedProgress,
        completedVideos,
        progressPercentage,
        currentVideoId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [SUBSCRIPTIONS] Video progress updated');

      return this.getSubscriptionById(id);
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error updating video progress:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(id: string): Promise<void> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Cancelling subscription:', id);

      await this.firestore.collection('subscriptions').doc(id).update({
        status: SubscriptionStatus.CANCELLED,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [SUBSCRIPTIONS] Subscription cancelled');
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Set subscription to pending (manual expiration by admin)
   */
  async setPendingSubscription(id: string): Promise<void> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Setting subscription to pending:', id);

      // Set subscription to pending status
      // Watch history is preserved for future renewal
      await this.firestore.collection('subscriptions').doc(id).update({
        status: SubscriptionStatus.PENDING,
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // completedVideos is intentionally NOT modified - preserved for renewal
      });

      console.log('✅ [SUBSCRIPTIONS] Subscription set to pending');
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error setting subscription to pending:', error);
      throw error;
    }
  }

  /**
   * Delete subscription
   */
  async deleteSubscription(id: string): Promise<void> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Deleting subscription:', id);

      await this.firestore.collection('subscriptions').doc(id).delete();

      console.log('✅ [SUBSCRIPTIONS] Subscription deleted');
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error deleting subscription:', error);
      throw error;
    }
  }

  /**
   * Check and expire subscriptions (should be called periodically)
   */
  async checkExpiredSubscriptions(): Promise<void> {
    try {
      const now = new Date();
      const snapshot = await this.firestore
        .collection('subscriptions')
        .where('status', '==', SubscriptionStatus.ACTIVE)
        .get();

      const batch = this.firestore.batch();
      let expiredCount = 0;

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const endDate = data.endDate?.toDate();

        if (endDate && endDate < now) {
          // Change status to PENDING when expired
          // Watch history (completedVideos) is preserved for future renewal
          batch.update(doc.ref, {
            status: SubscriptionStatus.PENDING,
            expiredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            // completedVideos is intentionally NOT modified - preserved for renewal
          });
          expiredCount++;
        }
      });

      if (expiredCount > 0) {
        await batch.commit();
        console.log(`✅ [SUBSCRIPTIONS] Expired ${expiredCount} subscriptions`);
      }
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error checking expired subscriptions:', error);
    }
  }

  /**
   * Initiate user subscription (for user panel)
   */
  async initiateUserSubscription(
    userId: string,
    strategyId: string,
    walletAddress: string,
    currency: string,
  ): Promise<any> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Initiating user subscription:', { userId, strategyId, walletAddress, currency });

      // Check if user already has an active or pending subscription
      const existingActiveSubscription = await this.getActiveSubscriptionByUserId(userId);
      if (existingActiveSubscription) {
        throw new BadRequestException('You already have an active subscription. Only one strategy subscription allowed at a time.');
      }

      // Check for pending subscriptions
      const pendingSnapshot = await this.firestore
        .collection('subscriptions')
        .where('userId', '==', userId)
        .where('status', '==', SubscriptionStatus.PENDING)
        .limit(1)
        .get();

      if (!pendingSnapshot.empty) {
        throw new BadRequestException('You have a pending subscription that needs renewal. Please renew instead of creating a new one.');
      }

      // Get user details
      const userDoc = await this.firestore.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new NotFoundException('User not found');
      }
      const userData = userDoc.data();

      // Get strategy details
      const strategyDoc = await this.firestore.collection('strategies').doc(strategyId).get();
      if (!strategyDoc.exists) {
        throw new NotFoundException('Strategy not found');
      }
      const strategyData = strategyDoc.data();

      // Get coach commission percentage
      let coachCommissionPercentage = 0;
      let coachId = userData?.assignedCoachId;

      if (coachId) {
        // Check for user-specific commission override
        if (userData?.coachCommissionOverride !== undefined && userData?.coachCommissionOverride !== null) {
          coachCommissionPercentage = userData.coachCommissionOverride;
        } else {
          // Use coach's default commission
          const coachDoc = await this.firestore.collection('coaches').doc(coachId).get();
          if (coachDoc.exists) {
            const coachData = coachDoc.data();
            coachCommissionPercentage = coachData?.defaultCommissionPercentage ?? 30;
          } else {
            coachCommissionPercentage = 30;
          }
        }
      }

      const strategyPrice = strategyData?.price || 0;
      const coachCommission = (strategyPrice * coachCommissionPercentage) / 100;
      const systemShare = strategyPrice - coachCommission;

      // Get payment settings
      const settingsDoc = await this.firestore.collection('payment_settings').doc('default').get();
      const settings = settingsDoc.data();
      const isTestMode = settings?.isTestMode ?? true;

      console.log(`💰 [SUBSCRIPTIONS] Payment settings:`, {
        isTestMode,
        hasApiKey: !!settings?.apiKey,
        isActive: settings?.isActive,
        cryptoEnabled: settings?.cryptoEnabled,
      });

      let paymentData: any;
      let pendingPaymentId: string;

      if (isTestMode || !settings?.apiKey || !settings?.isActive || !settings?.cryptoEnabled) {
        // TEST MODE or not configured - simulate payment
        console.log('🧪 [SUBSCRIPTIONS] Running in TEST MODE - simulating payment');
        console.log('Reason:', {
          isTestMode,
          missingApiKey: !settings?.apiKey,
          notActive: !settings?.isActive,
          cryptoNotEnabled: !settings?.cryptoEnabled,
        });
        
        const testPaymentId = `test_payment_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        paymentData = {
          paymentId: testPaymentId,
          paymentAddress: settings?.nowPaymentsWallet || walletAddress,
          amount: strategyPrice,
          strategyPrice,
          coachCommissionPercentage,
          coachCommission,
          systemShare,
          currency,
          testMode: true,
        };

        pendingPaymentId = `pending_${testPaymentId}`;
      } else {
        // PRODUCTION MODE - create real NOWPayments payment
        console.log('🚀 [SUBSCRIPTIONS] Running in PRODUCTION MODE - creating real payment');

        const orderId = `sub_${Date.now()}_${userId.substring(0, 8)}`;
        
        try {
          const nowPayment = await this.paymentsService.createNowPayment(
            strategyPrice,
            currency,
            orderId,
            `${strategyData?.name} subscription for user ${userData?.email}`,
          );

          paymentData = {
            ...nowPayment,
            strategyPrice,
            coachCommissionPercentage,
            coachCommission,
            systemShare,
            testMode: false,
          };

          pendingPaymentId = `pending_${nowPayment.paymentId}`;
        } catch (error) {
          console.error('❌ [SUBSCRIPTIONS] Failed to create NOWPayments payment:', error);
          throw new BadRequestException(
            'Failed to create payment. Please check your payment settings and try again.',
          );
        }
      }

      // Store pending payment info
      await this.firestore.collection('pending_payments').doc(pendingPaymentId).set({
        userId,
        strategyId,
        userWalletAddress: walletAddress,
        paymentId: paymentData.paymentId,
        currency,
        amount: strategyPrice,
        strategyPrice,
        coachCommissionPercentage,
        coachCommission,
        systemShare,
        coachId: coachId || null,
        status: 'waiting',
        testMode: isTestMode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [SUBSCRIPTIONS] Payment initiated:', pendingPaymentId);

      return paymentData;
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error initiating subscription:', error);
      throw error;
    }
  }

  /**
   * Confirm payment and create subscription (for user panel)
   */
  async confirmPayment(paymentId: string): Promise<any> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Confirming payment:', paymentId);

      // Add pending_ prefix if not already present
      const docId = paymentId.startsWith('pending_') ? paymentId : `pending_${paymentId}`;
      console.log('🔍 [SUBSCRIPTIONS] Looking for document:', docId);

      // Get pending payment
      const paymentDoc = await this.firestore.collection('pending_payments').doc(docId).get();
      if (!paymentDoc.exists) {
        throw new NotFoundException('Payment not found');
      }
      const paymentData = paymentDoc.data();

      // In production, this would verify the payment via NOWPayments webhook
      // For demo purposes, we'll simulate it

      let subscription: any;

      // Check if this is an upgrade or downgrade payment
      if ((paymentData?.type === 'upgrade' || paymentData?.type === 'downgrade') && paymentData?.oldStrategyId) {
        const isDowngrade = paymentData?.type === 'downgrade';
        console.log(`${isDowngrade ? '🔽' : '🔼'} [SUBSCRIPTIONS] This is a ${isDowngrade ? 'DOWNGRADE' : 'UPGRADE'} payment - updating existing subscription`);

        // Find the existing active subscription
        const existingSnapshot = await this.firestore
          .collection('subscriptions')
          .where('userId', '==', paymentData.userId)
          .where('status', '==', SubscriptionStatus.ACTIVE)
          .limit(1)
          .get();

        if (!existingSnapshot.empty) {
          const existingSubDoc = existingSnapshot.docs[0];
          const existingSubId = existingSubDoc.id;

          // Get new strategy data
          const newStrategyDoc = await this.firestore.collection('strategies').doc(paymentData.strategyId).get();
          const newStrategyData = newStrategyDoc.data();

          // Update the existing subscription to the new strategy
          // Reset video progress since it's a different strategy with different videos
          await this.firestore.collection('subscriptions').doc(existingSubId).update({
            strategyId: paymentData.strategyId,
            strategyName: newStrategyData?.name,
            strategyNumber: newStrategyData?.strategyNumber || 0,
            strategyPrice: newStrategyData?.price || 0,
            coachCommissionPercentage: paymentData.coachCommissionPercentage || 0,
            completedVideos: [], // Reset progress for new strategy
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Get updated subscription
          const updatedDoc = await this.firestore.collection('subscriptions').doc(existingSubId).get();
          subscription = { id: updatedDoc.id, ...updatedDoc.data() } as Subscription;

          console.log(`✅ [SUBSCRIPTIONS] Existing subscription ${isDowngrade ? 'downgraded' : 'upgraded'} to new strategy`);
        } else {
          throw new NotFoundException(`No active subscription found to ${isDowngrade ? 'downgrade' : 'upgrade'}`);
        }
      } else if (paymentData?.type === 'renewal') {
        console.log('🔄 [SUBSCRIPTIONS] This is a RENEWAL payment - updating subscription status');

        // Find the pending subscription
        const pendingSnapshot = await this.firestore
          .collection('subscriptions')
          .where('userId', '==', paymentData.userId)
          .where('status', '==', SubscriptionStatus.PENDING)
          .limit(1)
          .get();

        if (!pendingSnapshot.empty) {
          const pendingSubDoc = pendingSnapshot.docs[0];
          const pendingSubId = pendingSubDoc.id;

          // Renew the subscription (30 more days from now)
          // Watch history (completedVideos) is preserved - not modified
          const newEndDate = new Date();
          newEndDate.setDate(newEndDate.getDate() + 30);

          await this.firestore.collection('subscriptions').doc(pendingSubId).update({
            status: SubscriptionStatus.ACTIVE,
            endDate: admin.firestore.Timestamp.fromDate(newEndDate),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            // completedVideos is intentionally NOT modified - user continues from where they left off
          });

          // Get updated subscription
          const updatedDoc = await this.firestore.collection('subscriptions').doc(pendingSubId).get();
          subscription = { id: updatedDoc.id, ...updatedDoc.data() } as Subscription;

          console.log('✅ [SUBSCRIPTIONS] Pending subscription renewed');
        } else {
          throw new NotFoundException('No pending subscription found to renew');
        }
      } else {
        console.log('🆕 [SUBSCRIPTIONS] This is a NEW subscription payment');

        // Create a new subscription
        const createDto: CreateSubscriptionDto = {
          userId: paymentData?.userId,
          strategyId: paymentData?.strategyId,
          duration: 30,
          coachCommissionPercentage: paymentData?.coachCommissionPercentage || 0,
        };

        subscription = await this.createSubscription(createDto);
      }

      // Update payment status
      await this.firestore.collection('pending_payments').doc(docId).update({
        status: 'completed',
        subscriptionId: subscription.id,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ [SUBSCRIPTIONS] Payment confirmed and subscription updated');

      return {
        success: true,
        subscription,
      };
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error confirming payment:', error);
      throw error;
    }
  }

  /**
   * Cancel user's subscription
   */
  async cancelUserSubscription(userId: string): Promise<any> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Cancelling subscription for user:', userId);

      const subscription = await this.getActiveSubscriptionByUserId(userId);
      
      if (!subscription) {
        throw new NotFoundException('No active subscription found');
      }

      await this.cancelSubscription(subscription.id);

      console.log('✅ [SUBSCRIPTIONS] User subscription cancelled');

      return {
        success: true,
        message: 'Subscription cancelled successfully',
      };
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error cancelling user subscription:', error);
      throw error;
    }
  }

  /**
   * Renew user's subscription (same strategy, $100 fee)
   */
  async renewUserSubscription(
    userId: string,
    walletAddress: string,
    currency: string,
  ): Promise<any> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Renewing subscription for user:', userId);

      // Get current subscription
      const snapshot = await this.firestore
        .collection('subscriptions')
        .where('userId', '==', userId)
        .where('status', '==', SubscriptionStatus.PENDING)
        .limit(1)
        .get();

      if (snapshot.empty) {
        throw new BadRequestException('No pending subscription found to renew');
      }

      const currentSub = this.mapSubscription(snapshot.docs[0]);

      // Renewal fee is always $100
      const renewalFee = 100;

      // Get user and coach info
      const userDoc = await this.firestore.collection('users').doc(userId).get();
      const userData = userDoc.data();

      let coachCommissionPercentage = 0;
      let coachId = userData?.assignedCoachId;

      if (coachId) {
        if (userData?.coachCommissionOverride !== undefined && userData?.coachCommissionOverride !== null) {
          coachCommissionPercentage = userData.coachCommissionOverride;
        } else {
          const coachDoc = await this.firestore.collection('coaches').doc(coachId).get();
          if (coachDoc.exists) {
            const coachData = coachDoc.data();
            coachCommissionPercentage = coachData?.defaultCommissionPercentage ?? 30;
          } else {
            coachCommissionPercentage = 30;
          }
        }
      }

      // Create payment
      const paymentData = await this.createPaymentForRenewal(
        userId,
        currentSub.strategyId,
        renewalFee,
        walletAddress,
        currency,
        coachCommissionPercentage,
      );

      return paymentData;
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error renewing subscription:', error);
      throw error;
    }
  }

  /**
   * Upgrade user's subscription to a new strategy (pay difference only)
   */
  async upgradeUserSubscription(
    userId: string,
    newStrategyId: string,
    walletAddress: string,
    currency: string,
  ): Promise<any> {
    try {
      console.log('🔵 [SUBSCRIPTIONS] Upgrading subscription for user:', userId);

      // Get current subscription
      const currentSub = await this.getActiveSubscriptionByUserId(userId);
      
      if (!currentSub) {
        throw new BadRequestException('No active subscription found');
      }

      // Get new strategy
      const newStrategyDoc = await this.firestore.collection('strategies').doc(newStrategyId).get();
      if (!newStrategyDoc.exists) {
        throw new NotFoundException('New strategy not found');
      }
      const newStrategyData = newStrategyDoc.data();
      const newPrice = newStrategyData?.price || 0;

      // Calculate difference (absolute value)
      const currentPrice = currentSub.strategyPrice;
      const priceDifference = Math.abs(newPrice - currentPrice);

      // If same price, no payment needed - just switch
      if (newPrice === currentPrice) {
        console.log('🔄 [SUBSCRIPTIONS] Same price strategy - switching without payment');
        
        // Update subscription to new strategy
        await this.firestore.collection('subscriptions').doc(currentSub.id).update({
          strategyId: newStrategyId,
          strategyName: newStrategyData?.name,
          strategyNumber: newStrategyData?.strategyNumber || 0,
          strategyPrice: newPrice,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log('✅ [SUBSCRIPTIONS] Strategy switch completed - no payment required');

        return {
          success: true,
          message: 'Successfully switched to new strategy',
          noPaymentRequired: true,
        };
      }

      // Determine if upgrade or downgrade
      const isDowngrade = newPrice < currentPrice;
      
      // For UPGRADE: charge difference
      // For DOWNGRADE: charge full price of new (cheaper) strategy
      const amountToPay = isDowngrade ? newPrice : priceDifference;
      
      console.log(`${isDowngrade ? '🔽' : '🔼'} [SUBSCRIPTIONS] ${isDowngrade ? 'Downgrade' : 'Upgrade'} detected`);
      console.log(`   Current price: $${currentPrice}`);
      console.log(`   New price: $${newPrice}`);
      console.log(`   Amount to pay: $${amountToPay} ${isDowngrade ? '(full new strategy price)' : '(difference)'}`);

      // Get user and coach info
      const userDoc = await this.firestore.collection('users').doc(userId).get();
      const userData = userDoc.data();

      let coachCommissionPercentage = 0;
      let coachId = userData?.assignedCoachId;

      if (coachId) {
        if (userData?.coachCommissionOverride !== undefined && userData?.coachCommissionOverride !== null) {
          coachCommissionPercentage = userData.coachCommissionOverride;
        } else {
          const coachDoc = await this.firestore.collection('coaches').doc(coachId).get();
          if (coachDoc.exists) {
            const coachData = coachDoc.data();
            coachCommissionPercentage = coachData?.defaultCommissionPercentage ?? 30;
          } else {
            coachCommissionPercentage = 30;
          }
        }
      }

      // Create payment for upgrade or downgrade
      const paymentData = isDowngrade 
        ? await this.createPaymentForDowngrade(
            userId,
            currentSub.id,
            currentSub.strategyId,
            newStrategyId,
            amountToPay,
            walletAddress,
            currency,
            coachCommissionPercentage,
          )
        : await this.createPaymentForUpgrade(
            userId,
            currentSub.id,
            currentSub.strategyId,
            newStrategyId,
            amountToPay,
            walletAddress,
            currency,
            coachCommissionPercentage,
          );

      return paymentData;
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error upgrading subscription:', error);
      throw error;
    }
  }

  /**
   * Create payment for renewal
   */
  private async createPaymentForRenewal(
    userId: string,
    strategyId: string,
    amount: number,
    walletAddress: string,
    currency: string,
    coachCommissionPercentage: number,
  ): Promise<any> {
    const coachCommission = (amount * coachCommissionPercentage) / 100;
    const systemShare = amount - coachCommission;

    const settingsDoc = await this.firestore.collection('payment_settings').doc('default').get();
    const settings = settingsDoc.data();
    const isTestMode = settings?.isTestMode ?? true;

    let paymentData: any;
    let pendingPaymentId: string;

    if (isTestMode || !settings?.apiKey || !settings?.isActive || !settings?.cryptoEnabled) {
      paymentData = {
        paymentId: `test_renewal_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        paymentAddress: settings?.nowPaymentsWallet || walletAddress,
        amount,
        strategyPrice: amount,
        coachCommissionPercentage,
        coachCommission,
        systemShare,
        currency,
        testMode: true,
        type: 'renewal',
      };
      pendingPaymentId = `pending_${paymentData.paymentId}`;
    } else {
      const orderId = `renewal_${Date.now()}_${userId.substring(0, 8)}`;

      try {
        const nowPayment = await this.paymentsService.createNowPayment(
          amount,
          currency,
          orderId,
          `Subscription renewal for user`,
        );

        paymentData = {
          ...nowPayment,
          strategyPrice: amount,
          coachCommissionPercentage,
          coachCommission,
          systemShare,
          testMode: false,
          type: 'renewal',
        };

        pendingPaymentId = `pending_${nowPayment.paymentId}`;
      } catch (error) {
        throw new BadRequestException('Failed to create payment');
      }
    }

    await this.firestore.collection('pending_payments').doc(pendingPaymentId).set({
      userId,
      strategyId,
      userWalletAddress: walletAddress,
      paymentId: paymentData.paymentId,
      currency,
      amount,
      strategyPrice: amount,
      coachCommissionPercentage,
      coachCommission,
      systemShare,
      status: 'waiting',
      testMode: isTestMode,
      type: 'renewal',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return paymentData;
  }

  /**
   * Create payment for upgrade
   */
  private async createPaymentForUpgrade(
    userId: string,
    currentSubscriptionId: string,
    oldStrategyId: string,
    newStrategyId: string,
    amount: number,
    walletAddress: string,
    currency: string,
    coachCommissionPercentage: number,
  ): Promise<any> {
    const coachCommission = (amount * coachCommissionPercentage) / 100;
    const systemShare = amount - coachCommission;

    const settingsDoc = await this.firestore.collection('payment_settings').doc('default').get();
    const settings = settingsDoc.data();
    const isTestMode = settings?.isTestMode ?? true;

    let paymentData: any;
    let pendingPaymentId: string;

    if (isTestMode || !settings?.apiKey || !settings?.isActive || !settings?.cryptoEnabled) {
      paymentData = {
        paymentId: `test_upgrade_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        paymentAddress: settings?.nowPaymentsWallet || walletAddress,
        amount,
        strategyPrice: amount,
        coachCommissionPercentage,
        coachCommission,
        systemShare,
        currency,
        testMode: true,
        type: 'upgrade',
      };
      pendingPaymentId = `pending_${paymentData.paymentId}`;
    } else {
      const orderId = `upgrade_${Date.now()}_${userId.substring(0, 8)}`;

      try {
        const nowPayment = await this.paymentsService.createNowPayment(
          amount,
          currency,
          orderId,
          `Subscription upgrade for user`,
        );

        paymentData = {
          ...nowPayment,
          strategyPrice: amount,
          coachCommissionPercentage,
          coachCommission,
          systemShare,
          testMode: false,
          type: 'upgrade',
        };

        pendingPaymentId = `pending_${nowPayment.paymentId}`;
      } catch (error) {
        throw new BadRequestException('Failed to create payment');
      }
    }

    await this.firestore.collection('pending_payments').doc(pendingPaymentId).set({
      userId,
      strategyId: newStrategyId,
      oldStrategyId,
      currentSubscriptionId,
      userWalletAddress: walletAddress,
      paymentId: paymentData.paymentId,
      currency,
      amount,
      strategyPrice: amount,
      coachCommissionPercentage,
      coachCommission,
      systemShare,
      status: 'waiting',
      testMode: isTestMode,
      type: 'upgrade',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return paymentData;
  }

  /**
   * Create payment for downgrade (charges $100 renewal fee)
   */
  private async createPaymentForDowngrade(
    userId: string,
    currentSubscriptionId: string,
    oldStrategyId: string,
    newStrategyId: string,
    amount: number,
    walletAddress: string,
    currency: string,
    coachCommissionPercentage: number,
  ): Promise<any> {
    const coachCommission = (amount * coachCommissionPercentage) / 100;
    const systemShare = amount - coachCommission;

    const settingsDoc = await this.firestore.collection('payment_settings').doc('default').get();
    const settings = settingsDoc.data();
    const isTestMode = settings?.isTestMode ?? true;

    let paymentData: any;
    let pendingPaymentId: string;

    if (isTestMode || !settings?.apiKey || !settings?.isActive || !settings?.cryptoEnabled) {
      paymentData = {
        paymentId: `test_downgrade_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        paymentAddress: settings?.nowPaymentsWallet || walletAddress,
        amount,
        strategyPrice: amount,
        coachCommissionPercentage,
        coachCommission,
        systemShare,
        currency,
        testMode: true,
        type: 'downgrade',
      };
      pendingPaymentId = `pending_${paymentData.paymentId}`;
    } else {
      const orderId = `downgrade_${Date.now()}_${userId.substring(0, 8)}`;

      try {
        const nowPayment = await this.paymentsService.createNowPayment(
          amount,
          currency,
          orderId,
          `Subscription downgrade for user (renewal fee)`,
        );

        paymentData = {
          ...nowPayment,
          strategyPrice: amount,
          coachCommissionPercentage,
          coachCommission,
          systemShare,
          testMode: false,
          type: 'downgrade',
        };

        pendingPaymentId = `pending_${nowPayment.paymentId}`;
      } catch (error) {
        throw new BadRequestException('Failed to create payment');
      }
    }

    await this.firestore.collection('pending_payments').doc(pendingPaymentId).set({
      userId,
      strategyId: newStrategyId,
      oldStrategyId,
      currentSubscriptionId,
      userWalletAddress: walletAddress,
      paymentId: paymentData.paymentId,
      currency,
      amount,
      strategyPrice: amount,
      coachCommissionPercentage,
      coachCommission,
      systemShare,
      status: 'waiting',
      testMode: isTestMode,
      type: 'downgrade',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return paymentData;
  }

  /**
   * Map Firestore document to Subscription interface
   */
  private mapSubscription(doc: admin.firestore.DocumentSnapshot): Subscription {
    const data = doc.data();
    
    // Fix completedVideos if it's a number instead of array
    let completedVideos = data?.completedVideos || [];
    if (typeof completedVideos === 'number') {
      console.log('⚠️ [SUBSCRIPTIONS] Found completedVideos as number, converting to array');
      completedVideos = [];
    }

    console.log('📊 [SUBSCRIPTIONS] Mapping subscription:', {
      id: doc.id,
      completedVideos,
      totalVideos: data?.totalVideos,
      progressPercentage: data?.progressPercentage,
    });

    return {
      id: doc.id,
      userId: data?.userId || '',
      userName: data?.userName || '',
      userEmail: data?.userEmail || '',
      strategyId: data?.strategyId || '',
      strategyName: data?.strategyName || '',
      strategyNumber: data?.strategyNumber || 0,
      strategyPrice: data?.strategyPrice || 0,
      status: data?.status || SubscriptionStatus.PENDING,
      startDate: data?.startDate?.toDate() || new Date(),
      endDate: data?.endDate?.toDate() || new Date(),
      duration: data?.duration || 30,
      videoProgress: data?.videoProgress || [],
      completedVideos,
      totalVideos: data?.totalVideos || 0,
      progressPercentage: data?.progressPercentage || 0,
      currentVideoId: data?.currentVideoId,
      previousStrategyId: data?.previousStrategyId,
      previousStrategyPrice: data?.previousStrategyPrice,
      amountPaid: data?.amountPaid || 0,
      renewalCount: data?.renewalCount || 0,
      createdAt: data?.createdAt?.toDate() || new Date(),
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      expiredAt: data?.expiredAt?.toDate(),
    };
  }

  /**
   * Get user's video progress for their active subscription
   */
  async getUserVideoProgress(userId: string): Promise<any> {
    try {
      console.log('🎬 [SUBSCRIPTIONS] Getting video progress for user:', userId);

      // Check if user is admin
      const adminDoc = await this.firestore.collection('admins').doc(userId).get();
      const isAdmin = adminDoc.exists;

      console.log('👤 [SUBSCRIPTIONS] User is admin:', isAdmin);

      // If admin, allow access to all videos for testing
      if (isAdmin) {
        // For admin, get all strategies and videos
        const strategiesSnapshot = await this.firestore.collection('strategies').limit(1).get();
        
        if (strategiesSnapshot.empty) {
          return {
            subscription: {
              id: 'admin',
              strategyName: 'Admin Access',
              strategyNumber: 0,
              endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
            },
            progress: {
              totalVideos: 0,
              completedCount: 0,
              progressPercentage: 0,
              currentVideoId: null,
            },
            videos: [],
          };
        }

        const firstStrategy = strategiesSnapshot.docs[0];
        const strategyData = firstStrategy.data();
        const strategyId = firstStrategy.id;

        // Get all videos for the first strategy (for admin testing)
        const videosSnapshot = await this.firestore
          .collection('strategyVideos')
          .where('strategyId', '==', strategyId)
          .orderBy('order', 'asc')
          .get();

        const videos = videosSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          isCompleted: false,
          isCurrent: false,
          isLocked: false,
          canAccess: true, // Admin can access all videos
        }));

        return {
          subscription: {
            id: 'admin',
            strategyName: `${strategyData?.name} (Admin Preview)`,
            strategyNumber: strategyData?.strategyNumber || 0,
            endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
          progress: {
            totalVideos: videos.length,
            completedCount: 0,
            progressPercentage: 0,
            currentVideoId: videos.length > 0 ? videos[0].id : null,
          },
          videos,
        };
      }

      // Get active subscription
      const subscription = await this.getActiveSubscriptionByUserId(userId);
      
      if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
        throw new BadRequestException('No active subscription found');
      }

      // Get all videos for the subscribed strategy
      console.log('🔍 [SUBSCRIPTIONS] Searching for videos with strategyId:', subscription.strategyId);
      
      // First, try without isVisible filter to debug
      console.log('🔍 [SUBSCRIPTIONS] Querying strategyVideos collection...');
      console.log('🔍 [SUBSCRIPTIONS] StrategyId to match:', subscription.strategyId);
      
      const allVideosSnapshot = await this.firestore
        .collection('strategyVideos')
        .where('strategyId', '==', subscription.strategyId)
        .get();
      
      console.log('📹 [SUBSCRIPTIONS] Total videos for strategy (all):', allVideosSnapshot.size);
      
      if (allVideosSnapshot.size === 0) {
        // Check if ANY videos exist in the collection
        const anyVideosSnapshot = await this.firestore
          .collection('strategyVideos')
          .limit(5)
          .get();
        console.log('🔍 [SUBSCRIPTIONS] Total videos in entire collection:', anyVideosSnapshot.size);
        anyVideosSnapshot.docs.forEach(doc => {
          const data = doc.data();
          console.log('  📹 Found video:', { 
            id: doc.id, 
            title: data?.title, 
            strategyId: data?.strategyId,
            isVisible: data?.isVisible, 
            videoNumber: data?.videoNumber 
          });
        });
      } else {
        allVideosSnapshot.docs.forEach(doc => {
          const data = doc.data();
          console.log('  - Video:', { id: doc.id, title: data?.title, isVisible: data?.isVisible, videoNumber: data?.videoNumber });
        });
      }
      
      const videosSnapshot = await this.firestore
        .collection('strategyVideos')
        .where('strategyId', '==', subscription.strategyId)
        .where('isVisible', '==', true)
        .orderBy('order', 'asc')
        .get();

      console.log('📹 [SUBSCRIPTIONS] Found visible videos:', videosSnapshot.size);

      const videos = videosSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Video data:', { id: doc.id, title: data?.title, isVisible: data?.isVisible });
        return {
          id: doc.id,
          ...data,
        };
      });

      // Calculate progress
      const completedVideos = subscription.completedVideos || [];
      const totalVideos = videos.length;
      const completedCount = completedVideos.length;
      const progressPercentage = totalVideos > 0 ? Math.round((completedCount / totalVideos) * 100) : 0;

      // Determine current video (first uncompleted video)
      let currentVideoId: string | null = null;
      for (const video of videos) {
        if (!completedVideos.includes(video.id)) {
          currentVideoId = video.id;
          break;
        }
      }

      // Map videos with their status
      const videosWithStatus = videos.map((video, index) => {
        const isCompleted = completedVideos.includes(video.id);
        const isCurrent = video.id === currentVideoId;
        const isLocked = index > 0 && !completedVideos.includes(videos[index - 1].id);

        return {
          ...video,
          isCompleted,
          isCurrent,
          isLocked,
          canAccess: !isLocked,
        };
      });

      console.log('✅ [SUBSCRIPTIONS] Video progress fetched:', {
        totalVideos,
        completedCount,
        progressPercentage,
      });

      return {
        subscription: {
          id: subscription.id,
          strategyName: subscription.strategyName,
          strategyNumber: subscription.strategyNumber,
          endDate: subscription.endDate,
        },
        progress: {
          totalVideos,
          completedCount,
          progressPercentage,
          currentVideoId,
        },
        videos: videosWithStatus,
      };
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error getting video progress:', error);
      throw error;
    }
  }

  /**
   * Mark a video as complete
   */
  async markVideoComplete(userId: string, videoId: string): Promise<any> {
    try {
      console.log('✅ [SUBSCRIPTIONS] Marking video complete:', { userId, videoId });

      // Get active subscription
      const subscription = await this.getActiveSubscriptionByUserId(userId);
      
      if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
        throw new BadRequestException('No active subscription found');
      }

      // Validate video belongs to strategy
      const videoDoc = await this.firestore.collection('strategyVideos').doc(videoId).get();
      if (!videoDoc.exists) {
        throw new NotFoundException('Video not found');
      }

      const videoData = videoDoc.data();
      if (videoData?.strategyId !== subscription.strategyId) {
        throw new BadRequestException('Video does not belong to your subscribed strategy');
      }

      // Check if video can be accessed (previous videos must be completed)
      const accessValidation = await this.validateVideoAccess(userId, videoId);
      if (!accessValidation.canAccess) {
        throw new BadRequestException('You must complete previous videos first');
      }

      // Add video to completed list if not already there
      const completedVideos = subscription.completedVideos || [];
      if (!completedVideos.includes(videoId)) {
        completedVideos.push(videoId);

        // Calculate progress percentage
        const totalVideos = subscription.totalVideos || 0;
        const progressPercentage = totalVideos > 0 ? Math.round((completedVideos.length / totalVideos) * 100) : 0;

        await this.firestore.collection('subscriptions').doc(subscription.id).update({
          completedVideos,
          progressPercentage,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`✅ [SUBSCRIPTIONS] Video marked as complete. Progress: ${completedVideos.length}/${totalVideos} (${progressPercentage}%)`);
      }

      return {
        success: true,
        message: 'Video marked as complete',
      };
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error marking video complete:', error);
      throw error;
    }
  }

  /**
   * Validate if user can access a specific video
   */
  async validateVideoAccess(userId: string, videoId: string): Promise<any> {
    try {
      console.log('🔒 [SUBSCRIPTIONS] Validating video access:', { userId, videoId });

      // Check if user is admin
      const adminDoc = await this.firestore.collection('admins').doc(userId).get();
      if (adminDoc.exists) {
        console.log('✅ [SUBSCRIPTIONS] Admin access granted');
        return {
          canAccess: true,
          reason: 'Admin access',
        };
      }

      // Get active subscription
      const subscription = await this.getActiveSubscriptionByUserId(userId);
      
      if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
        return {
          canAccess: false,
          reason: 'No active subscription',
        };
      }

      // Get video details
      const videoDoc = await this.firestore.collection('strategyVideos').doc(videoId).get();
      if (!videoDoc.exists) {
        return {
          canAccess: false,
          reason: 'Video not found',
        };
      }

      const videoData = videoDoc.data();

      // Check if video belongs to subscribed strategy
      if (videoData?.strategyId !== subscription.strategyId) {
        return {
          canAccess: false,
          reason: 'Video does not belong to your subscribed strategy',
        };
      }

      // Check if video is visible
      if (!videoData?.isVisible) {
        return {
          canAccess: false,
          reason: 'Video is not available',
        };
      }

      // Get all videos in order
      const videosSnapshot = await this.firestore
        .collection('strategyVideos')
        .where('strategyId', '==', subscription.strategyId)
        .where('isVisible', '==', true)
        .orderBy('order', 'asc')
        .get();

      const videos = videosSnapshot.docs.map(doc => ({ id: doc.id, title: doc.data()?.title || '', ...doc.data() }));
      const videoIndex = videos.findIndex(v => v.id === videoId);

      if (videoIndex === -1) {
        return {
          canAccess: false,
          reason: 'Video not found in strategy',
        };
      }

      // First video is always accessible
      if (videoIndex === 0) {
        console.log('✅ [SUBSCRIPTIONS] Access granted (first video)');
        return {
          canAccess: true,
          reason: 'First video',
        };
      }

      // Check if previous video is completed
      const previousVideo = videos[videoIndex - 1];
      const completedVideos = subscription.completedVideos || [];
      
      if (!completedVideos.includes(previousVideo.id)) {
        return {
          canAccess: false,
          reason: `You must complete "${previousVideo.title || 'the previous video'}" first`,
        };
      }

      console.log('✅ [SUBSCRIPTIONS] Access granted');
      return {
        canAccess: true,
        reason: 'Previous videos completed',
      };
    } catch (error) {
      console.error('❌ [SUBSCRIPTIONS] Error validating video access:', error);
      return {
        canAccess: false,
        reason: 'Error validating access',
      };
    }
  }
}

