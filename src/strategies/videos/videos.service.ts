import { Injectable, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseConfig } from '../../database/firebase/firebase.config';
import { StrategyVideo, CreateVideoDto, UpdateVideoDto } from './interfaces/video.interface';

@Injectable()
export class VideosService {
  private firestore: admin.firestore.Firestore;

  constructor(private firebaseConfig: FirebaseConfig) {
    this.firestore = this.firebaseConfig.getFirestore();
  }

  /**
   * Get next video order for a strategy
   */
  private async getNextVideoOrder(strategyId: string): Promise<number> {
    try {
      const snapshot = await this.firestore
        .collection('strategyVideos')
        .where('strategyId', '==', strategyId)
        .orderBy('order', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return 1;
      }

      const lastVideo = snapshot.docs[0].data();
      return (lastVideo?.order || 0) + 1;
    } catch (error) {
      console.error('❌ [VIDEOS] Error getting next order:', error);
      return 1;
    }
  }

  /**
   * Create a new video
   */
  async createVideo(strategyId: string, createVideoDto: CreateVideoDto): Promise<StrategyVideo> {
    try {
      console.log('🔵 [VIDEOS] Creating video for strategy:', strategyId);

      const nextOrder = await this.getNextVideoOrder(strategyId);

      const videoData = {
        ...createVideoDto,
        strategyId,
        order: nextOrder,
        isVisible: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await this.firestore.collection('strategyVideos').add(videoData);

      console.log('✅ [VIDEOS] Video created:', docRef.id);

      return this.getVideoById(strategyId, docRef.id);
    } catch (error) {
      console.error('❌ [VIDEOS] Error creating video:', error);
      throw error;
    }
  }

  /**
   * Get all videos for a strategy
   */
  async getAllVideos(strategyId: string): Promise<StrategyVideo[]> {
    try {
      const snapshot = await this.firestore
        .collection('strategyVideos')
        .where('strategyId', '==', strategyId)
        .orderBy('order', 'asc')
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data?.createdAt?.toDate(),
          updatedAt: data?.updatedAt?.toDate(),
        };
      }) as StrategyVideo[];
    } catch (error) {
      console.error('❌ [VIDEOS] Error fetching videos:', error);
      throw error;
    }
  }

  /**
   * Get video by ID
   */
  async getVideoById(strategyId: string, videoId: string): Promise<StrategyVideo> {
    try {
      const doc = await this.firestore.collection('strategyVideos').doc(videoId).get();

      if (!doc.exists) {
        throw new NotFoundException('Video not found');
      }

      const data = doc.data();
      
      if (data?.strategyId !== strategyId) {
        throw new NotFoundException('Video not found in this strategy');
      }

      return {
        id: doc.id,
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
      } as StrategyVideo;
    } catch (error) {
      console.error('❌ [VIDEOS] Error fetching video:', error);
      throw error;
    }
  }

  /**
   * Update video
   */
  async updateVideo(
    strategyId: string,
    videoId: string,
    updateVideoDto: UpdateVideoDto,
  ): Promise<StrategyVideo> {
    try {
      console.log('🔵 [VIDEOS] Updating video:', videoId);

      const videoRef = this.firestore.collection('strategyVideos').doc(videoId);
      const video = await videoRef.get();

      if (!video.exists) {
        throw new NotFoundException('Video not found');
      }

      const videoData = video.data();
      if (videoData?.strategyId !== strategyId) {
        throw new NotFoundException('Video not found in this strategy');
      }

      // Filter out undefined values
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      Object.keys(updateVideoDto).forEach((key) => {
        const value = updateVideoDto[key as keyof UpdateVideoDto];
        if (value !== undefined) {
          updateData[key] = value;
        }
      });

      await videoRef.update(updateData);

      console.log('✅ [VIDEOS] Video updated successfully');

      return this.getVideoById(strategyId, videoId);
    } catch (error) {
      console.error('❌ [VIDEOS] Error updating video:', error);
      throw error;
    }
  }

  /**
   * Reorder video
   */
  async reorderVideo(strategyId: string, videoId: string, newOrder: number): Promise<void> {
    try {
      console.log('🔵 [VIDEOS] Reordering video:', videoId, 'to order:', newOrder);

      const videoRef = this.firestore.collection('strategyVideos').doc(videoId);
      const video = await videoRef.get();

      if (!video.exists) {
        throw new NotFoundException('Video not found');
      }

      const videoData = video.data();
      if (videoData?.strategyId !== strategyId) {
        throw new NotFoundException('Video not found in this strategy');
      }

      const oldOrder = videoData?.order;

      // Get the video that's currently at the new position
      const targetVideoSnapshot = await this.firestore
        .collection('strategyVideos')
        .where('strategyId', '==', strategyId)
        .where('order', '==', newOrder)
        .get();

      // Swap orders
      const batch = this.firestore.batch();

      if (!targetVideoSnapshot.empty) {
        const targetVideoRef = targetVideoSnapshot.docs[0].ref;
        batch.update(targetVideoRef, { 
          order: oldOrder,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      batch.update(videoRef, { 
        order: newOrder,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      console.log('✅ [VIDEOS] Video reordered successfully');
    } catch (error) {
      console.error('❌ [VIDEOS] Error reordering video:', error);
      throw error;
    }
  }

  /**
   * Toggle video visibility
   */
  async toggleVisibility(strategyId: string, videoId: string, isVisible: boolean): Promise<StrategyVideo> {
    try {
      console.log('🔵 [VIDEOS] Toggling visibility for video:', videoId);

      return this.updateVideo(strategyId, videoId, { isVisible });
    } catch (error) {
      console.error('❌ [VIDEOS] Error toggling visibility:', error);
      throw error;
    }
  }

  /**
   * Delete video
   */
  async deleteVideo(strategyId: string, videoId: string): Promise<void> {
    try {
      console.log('🔵 [VIDEOS] Deleting video:', videoId);

      const videoRef = this.firestore.collection('strategyVideos').doc(videoId);
      const video = await videoRef.get();

      if (!video.exists) {
        throw new NotFoundException('Video not found');
      }

      const videoData = video.data();
      if (videoData?.strategyId !== strategyId) {
        throw new NotFoundException('Video not found in this strategy');
      }

      await videoRef.delete();

      console.log('✅ [VIDEOS] Video deleted successfully');
    } catch (error) {
      console.error('❌ [VIDEOS] Error deleting video:', error);
      throw error;
    }
  }

  /**
   * Check if user has active subscription to strategy
   */
  private async hasActiveSubscription(userId: string, strategyId: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const snapshot = await this.firestore
        .collection('subscriptions')
        .where('userId', '==', userId)
        .where('strategyId', '==', strategyId)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      return !snapshot.empty;
    } catch (error) {
      console.error('❌ [VIDEOS] Error checking subscription:', error);
      return false;
    }
  }

  /**
   * Convert Firebase Storage URL to Cloudflare Worker URL
   */
  private convertToCloudflareUrl(firebaseUrl: string): string {
    if (!firebaseUrl) return firebaseUrl;
    
    try {
      // Check if it's already a Cloudflare URL
      if (firebaseUrl.includes('workers.dev')) {
        return firebaseUrl;
      }
      
      // Extract the storage path from Firebase URL
      // Example: https://firebasestorage.googleapis.com/v0/b/respike-670a4.firebasestorage.app/o/strategies%2F...
      const match = firebaseUrl.match(/\/o\/([^?]+)/);
      if (match && match[1]) {
        const encodedPath = match[1];
        const decodedPath = decodeURIComponent(encodedPath);
        
        console.log('🔄 Converting Firebase URL to Cloudflare:', decodedPath);
        
        // Return Cloudflare Worker URL
        return `https://firebase-video-proxy.brhimakil-1.workers.dev/${decodedPath}`;
      }
      
      // If it's a public URL format, extract differently
      const publicMatch = firebaseUrl.match(/storage\.googleapis\.com\/([^\/]+)\/(.+)/);
      if (publicMatch && publicMatch[2]) {
        const path = publicMatch[2];
        console.log('🔄 Converting public Firebase URL to Cloudflare:', path);
        return `https://firebase-video-proxy.brhimakil-1.workers.dev/${path}`;
      }
      
      console.warn('⚠️ Could not convert URL, returning original:', firebaseUrl);
      return firebaseUrl;
    } catch (error) {
      console.error('❌ Error converting URL:', error);
      return firebaseUrl;
    }
  }

  /**
   * Get all videos for a user (filters based on subscription)
   */
  async getAllVideosForUser(strategyId: string, userId?: string): Promise<any[]> {
    try {
      console.log('🔍 [VIDEOS] getAllVideosForUser called with:', { strategyId, userId });
      const videos = await this.getAllVideos(strategyId);
      console.log('📹 [VIDEOS] Found videos:', videos.length);
      
      // Check if user is admin
      if (userId) {
        console.log('👤 [VIDEOS] Checking if user is admin:', userId);
        const adminDoc = await this.firebaseConfig.getFirestore().collection('admins').doc(userId).get();
        console.log('👑 [VIDEOS] Admin check result:', adminDoc.exists);
        if (adminDoc.exists) {
          console.log('✅ [VIDEOS] Admin access granted - returning all videos');
          // Return videos as-is (Bunny.net URLs are already in database)
          return videos;
        }
      } else {
        console.log('⚠️ [VIDEOS] No userId provided - treating as anonymous');
      }
      
      const hasSubscription = userId ? await this.hasActiveSubscription(userId, strategyId) : false;

      // If user has active subscription, return full video data
      if (hasSubscription) {
        return videos;
      }

      // Otherwise, return only basic info without video URL and description
      return videos.map((video) => ({
        id: video.id,
        title: video.title,
        order: video.order,
        isVisible: video.isVisible,
        coverPhotoUrl: video.coverPhotoUrl,
        // Hide sensitive data
        videoUrl: undefined,
        description: '🔒 Subscribe to unlock this video',
        locked: true,
      }));
    } catch (error) {
      console.error('❌ [VIDEOS] Error fetching videos for user:', error);
      throw error;
    }
  }

  /**
   * Get single video for a user (checks subscription)
   */
  async getVideoByIdForUser(strategyId: string, videoId: string, userId?: string): Promise<any> {
    try {
      const video = await this.getVideoById(strategyId, videoId);
      
      // Check if user is admin
      if (userId) {
        const adminDoc = await this.firebaseConfig.getFirestore().collection('admins').doc(userId).get();
        if (adminDoc.exists) {
          console.log('👑 [VIDEOS] Admin access - returning full video');
          return video; // Admin gets full access
        }
      }
      
      const hasSubscription = userId ? await this.hasActiveSubscription(userId, strategyId) : false;
      console.log('🔍 [VIDEOS] Subscription check result:', { userId, strategyId, hasSubscription });

      // If user has active subscription, return full video data with videoUrl
      if (hasSubscription) {
        console.log('✅ [VIDEOS] User has subscription - returning video with URL');
        return video;
      }

      // Otherwise, return limited info
      console.log('❌ [VIDEOS] No subscription - hiding videoUrl');
      return {
        id: video.id,
        title: video.title,
        order: video.order,
        isVisible: video.isVisible,
        coverPhotoUrl: video.coverPhotoUrl,
        // Hide sensitive data
        videoUrl: undefined,
        description: '🔒 Subscribe to unlock this video',
        locked: true,
        message: 'You need an active subscription to access this video',
      };
    } catch (error) {
      console.error('❌ [VIDEOS] Error fetching video for user:', error);
      throw error;
    }
  }
}

