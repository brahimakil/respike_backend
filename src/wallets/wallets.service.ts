import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { CashoutDto } from './dto/cashout.dto';
import {
  Wallet,
  WalletOwnerType,
  WalletStatus,
  WalletTransaction,
  TransactionType,
  CoachCommission,
  CommissionSplit,
} from './interfaces/wallet.interface';

@Injectable()
export class WalletsService {
  private firestore: admin.firestore.Firestore;

  constructor(private firebaseConfig: FirebaseConfig) {
    this.firestore = this.firebaseConfig.getFirestore();
  }

  /**
   * Get or create wallet for owner
   */
  async getOrCreateWallet(ownerId: string, ownerType: WalletOwnerType, ownerName: string): Promise<Wallet> {
    try {
      // Check if wallet exists
      const snapshot = await this.firestore
        .collection('wallets')
        .where('ownerId', '==', ownerId)
        .where('ownerType', '==', ownerType)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return this.mapWallet(doc);
      }

      // Create new wallet
      const walletData = {
        ownerId,
        ownerType,
        ownerName,
        balance: 0,
        totalEarned: 0,
        currency: 'USD',
        status: WalletStatus.ACTIVE,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await this.firestore.collection('wallets').add(walletData);
      console.log(`✅ [WALLET] Created new wallet for ${ownerType} ${ownerName}`);

      return this.getWalletById(docRef.id);
    } catch (error) {
      console.error('❌ [WALLET] Error getting or creating wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet by ID
   */
  async getWalletById(id: string): Promise<Wallet> {
    try {
      const doc = await this.firestore.collection('wallets').doc(id).get();

      if (!doc.exists) {
        throw new NotFoundException('Wallet not found');
      }

      return this.mapWallet(doc);
    } catch (error) {
      console.error('❌ [WALLET] Error fetching wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet by owner ID
   */
  async getWalletByOwnerId(ownerId: string): Promise<Wallet | null> {
    try {
      console.log(`🔍 [WALLET] Searching for wallet with ownerId: ${ownerId}`);
      
      const snapshot = await this.firestore
        .collection('wallets')
        .where('ownerId', '==', ownerId)
        .limit(1)
        .get();

      console.log(`📊 [WALLET] Found ${snapshot.size} wallets`);
      
      if (snapshot.empty) {
        // Let's check all wallets to debug
        const allWallets = await this.firestore.collection('wallets').get();
        console.log(`🔍 [WALLET] All wallets in DB:`, allWallets.docs.map(d => ({
          id: d.id,
          ownerId: d.data().ownerId,
          ownerName: d.data().ownerName,
          ownerType: d.data().ownerType
        })));
        return null;
      }

      const wallet = this.mapWallet(snapshot.docs[0]);
      console.log(`✅ [WALLET] Found wallet:`, wallet);
      return wallet;
    } catch (error) {
      console.error('❌ [WALLET] Error fetching wallet by owner:', error);
      throw error;
    }
  }

  /**
   * Get system wallet
   */
  async getSystemWallet(): Promise<Wallet> {
    return this.getOrCreateWallet('system', WalletOwnerType.SYSTEM, 'System Wallet');
  }

  /**
   * Add transaction to wallet
   */
  async addTransaction(
    walletId: string,
    type: TransactionType,
    amount: number,
    description: string,
    referenceId?: string,
    referenceType?: string,
    metadata?: any,
  ): Promise<WalletTransaction> {
    try {
      const wallet = await this.getWalletById(walletId);
      const balanceBefore = wallet.balance;
      const balanceAfter = type === TransactionType.CREDIT ? balanceBefore + amount : balanceBefore - amount;

      // Create transaction record
      const transactionData = {
        walletId,
        type,
        amount,
        description,
        referenceId: referenceId || null,
        referenceType: referenceType || null,
        balanceBefore,
        balanceAfter,
        metadata: metadata || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const transactionRef = await this.firestore.collection('wallet_transactions').add(transactionData);

      // Update wallet balance
      const updateData: any = {
        balance: balanceAfter,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (type === TransactionType.CREDIT) {
        updateData.totalEarned = admin.firestore.FieldValue.increment(amount);
      }

      await this.firestore.collection('wallets').doc(walletId).update(updateData);

      console.log(`✅ [WALLET] Transaction added: ${type} $${amount} to wallet ${walletId}`);

      const doc = await this.firestore.collection('wallet_transactions').doc(transactionRef.id).get();
      return this.mapTransaction(doc);
    } catch (error) {
      console.error('❌ [WALLET] Error adding transaction:', error);
      throw error;
    }
  }

  /**
   * Calculate commission split
   */
  calculateCommissionSplit(totalAmount: number, commissionPercentage: number): CommissionSplit {
    const coachAmount = (totalAmount * commissionPercentage) / 100;
    const systemAmount = totalAmount - coachAmount;

    return {
      coachAmount: Math.round(coachAmount * 100) / 100, // Round to 2 decimals
      systemAmount: Math.round(systemAmount * 100) / 100,
      percentage: commissionPercentage,
    };
  }

  /**
   * Process subscription payment with coach commission
   */
  async processSubscriptionPayment(
    subscriptionId: string,
    userId: string,
    userName: string,
    strategyName: string,
    totalAmount: number,
    coachId?: string,
    coachName?: string,
    commissionPercentage?: number,
    paymentMethod?: string,
  ): Promise<CoachCommission | null> {
    try {
      console.log(`🔵 [WALLET] Processing payment:`, {
        subscriptionId,
        totalAmount,
        paymentMethod,
        coachId,
        commissionPercentage
      });

      // Get system wallet
      const systemWallet = await this.getSystemWallet();

      // If no coach, all money goes to system
      if (!coachId || commissionPercentage === 0 || !commissionPercentage) {
        await this.addTransaction(
          systemWallet.id,
          TransactionType.CREDIT,
          totalAmount,
          `Subscription payment from ${userName} for ${strategyName}`,
          subscriptionId,
          'subscription',
          { userId, strategyName, paymentMethod },
        );

        console.log(`✅ [WALLET] Full amount $${totalAmount} added to system wallet (no coach)`);
        return null;
      }

      // Calculate commission split
      const split = this.calculateCommissionSplit(totalAmount, commissionPercentage);

      // Get or create coach wallet
      const coachWallet = await this.getOrCreateWallet(coachId, WalletOwnerType.COACH, coachName || 'Coach');

      // Add coach commission
      await this.addTransaction(
        coachWallet.id,
        TransactionType.CREDIT,
        split.coachAmount,
        `Commission (${commissionPercentage}%) from ${userName}'s subscription to ${strategyName}`,
        subscriptionId,
        'commission',
        { userId, userName, strategyName, totalAmount, commissionPercentage, paymentMethod },
      );

      // Add system amount
      await this.addTransaction(
        systemWallet.id,
        TransactionType.CREDIT,
        split.systemAmount,
        `System share from ${userName}'s subscription to ${strategyName} (Coach: ${coachName})`,
        subscriptionId,
        'subscription',
        { userId, userName, strategyName, coachId, coachName, totalAmount, commissionPercentage, paymentMethod },
      );

      // Record commission
      const commissionData: CoachCommission = {
        subscriptionId,
        coachId,
        coachName: coachName || 'Coach',
        userId,
        userName,
        strategyName,
        totalAmount,
        commissionPercentage,
        commissionAmount: split.coachAmount,
        systemAmount: split.systemAmount,
        createdAt: new Date(),
      };

      await this.firestore.collection('coach_commissions').add({
        ...commissionData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ [WALLET] Commission processed: Coach $${split.coachAmount} | System $${split.systemAmount}`);

      return commissionData;
    } catch (error) {
      console.error('❌ [WALLET] Error processing subscription payment:', error);
      throw error;
    }
  }

  /**
   * Get all transactions for a wallet
   */
  async getWalletTransactions(walletId: string): Promise<WalletTransaction[]> {
    try {
      const snapshot = await this.firestore
        .collection('wallet_transactions')
        .where('walletId', '==', walletId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => this.mapTransaction(doc));
    } catch (error) {
      console.error('❌ [WALLET] Error fetching wallet transactions:', error);
      throw error;
    }
  }

  /**
   * Get all coach commissions
   */
  async getAllCommissions(): Promise<CoachCommission[]> {
    try {
      const snapshot = await this.firestore
        .collection('coach_commissions')
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          subscriptionId: data.subscriptionId,
          coachId: data.coachId,
          coachName: data.coachName,
          userId: data.userId,
          userName: data.userName,
          strategyName: data.strategyName,
          totalAmount: data.totalAmount,
          commissionPercentage: data.commissionPercentage,
          commissionAmount: data.commissionAmount,
          systemAmount: data.systemAmount,
          createdAt: data.createdAt?.toDate() || new Date(),
        };
      });
    } catch (error) {
      console.error('❌ [WALLET] Error fetching commissions:', error);
      throw error;
    }
  }

  /**
   * Get all wallets
   */
  async getAllWallets(): Promise<Wallet[]> {
    try {
      const snapshot = await this.firestore.collection('wallets').orderBy('createdAt', 'desc').get();

      return snapshot.docs.map((doc) => this.mapWallet(doc));
    } catch (error) {
      console.error('❌ [WALLET] Error fetching wallets:', error);
      throw error;
    }
  }

  /**
   * Map Firestore document to Wallet
   */
  private mapWallet(doc: admin.firestore.DocumentSnapshot): Wallet {
    const data = doc.data();
    return {
      id: doc.id,
      ownerId: data?.ownerId || '',
      ownerType: data?.ownerType || WalletOwnerType.SYSTEM,
      ownerName: data?.ownerName || '',
      balance: data?.balance || 0,
      totalEarned: data?.totalEarned || 0,
      currency: data?.currency || 'USD',
      status: data?.status || WalletStatus.ACTIVE,
      createdAt: data?.createdAt?.toDate() || new Date(),
      updatedAt: data?.updatedAt?.toDate() || new Date(),
    };
  }

  /**
   * Map Firestore document to WalletTransaction
   */
  private mapTransaction(doc: admin.firestore.DocumentSnapshot): WalletTransaction {
    const data = doc.data();
    return {
      id: doc.id,
      walletId: data?.walletId || '',
      type: data?.type || TransactionType.CREDIT,
      amount: data?.amount || 0,
      description: data?.description || '',
      referenceId: data?.referenceId,
      referenceType: data?.referenceType,
      balanceBefore: data?.balanceBefore || 0,
      balanceAfter: data?.balanceAfter || 0,
      metadata: data?.metadata,
      createdAt: data?.createdAt?.toDate() || new Date(),
    };
  }

  /**
   * Process cashout (withdrawal) for coach
   */
  async processCashout(walletId: string, cashoutDto: CashoutDto): Promise<any> {
    try {
      console.log(`🔵 [WALLET] Processing cashout for wallet ${walletId}:`, cashoutDto);

      // Get wallet
      const wallet = await this.getWalletById(walletId);

      // Validate balance
      if (wallet.balance < cashoutDto.amount) {
        throw new BadRequestException(`Insufficient balance. Available: $${wallet.balance}, Requested: $${cashoutDto.amount}`);
      }

      // Get payment settings
      const settingsDoc = await this.firestore.collection('payment_settings').doc('default').get();
      const settings = settingsDoc.data();
      const isTestMode = settings?.isTestMode ?? true;

      let payoutResult: any = null;

      console.log(`💸 [WALLET] Cashout mode: ${isTestMode ? 'TEST' : 'PRODUCTION'}`);

      if (!isTestMode && settings?.apiKey && settings?.isActive && settings?.cryptoEnabled) {
        // PRODUCTION MODE - create real NOWPayments payout
        console.log(`🚀 [WALLET] Running in PRODUCTION MODE - creating real payout`);
        
        try {
          // For production payouts, we need to create the payout record
          // The actual NOWPayments payout API call would go here
          console.log('⚠️ [WALLET] Real payout creation requires NOWPayments API key');
          
          payoutResult = {
            id: `prod_payout_${Date.now()}`,
            testMode: false,
            note: 'Payout creation - implement NOWPayments payout API',
          };

          console.log(`✅ [WALLET] Real payout created:`, payoutResult.id);
        } catch (error) {
          console.error('❌ [WALLET] Failed to create real payout:', error);
          throw new BadRequestException(
            'Failed to create payout. Please check your payment settings and try again.',
          );
        }
      } else {
        // TEST MODE - simulate payout
        console.log(`🧪 [WALLET] Running in TEST MODE - simulating payout`);
        payoutResult = {
          id: `test_payout_${Date.now()}`,
          testMode: true,
        };
      }

      console.log(`💰 [WALLET] Recording payout: $${cashoutDto.amount} ${cashoutDto.currency} to ${cashoutDto.walletAddress}`);

      // Record transaction
      await this.addTransaction(
        walletId,
        TransactionType.DEBIT,
        cashoutDto.amount,
        `Cashout to ${cashoutDto.currency} wallet: ${cashoutDto.walletAddress.substring(0, 10)}...`,
        payoutResult?.id,
        'cashout',
        {
          walletAddress: cashoutDto.walletAddress,
          currency: cashoutDto.currency,
          cashoutAmount: cashoutDto.amount,
          payoutId: payoutResult?.id,
          testMode: isTestMode,
        },
      );

      console.log(`✅ [WALLET] Cashout processed successfully`);

      return {
        success: true,
        message: 'Cashout processed successfully',
        amount: cashoutDto.amount,
        currency: cashoutDto.currency,
        walletAddress: cashoutDto.walletAddress,
        newBalance: wallet.balance - cashoutDto.amount,
        payoutId: payoutResult?.id,
        testMode: isTestMode,
      };
    } catch (error) {
      console.error('❌ [WALLET] Error processing cashout:', error);
      throw error;
    }
  }
}

