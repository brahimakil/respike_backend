import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import { WalletsService } from '../wallets/wallets.service';
import { ThreePayService } from '../services/threepay.service';
import * as admin from 'firebase-admin';
import axios from 'axios';
import {
  PaymentSettings,
  PaymentTransaction,
  PaymentStatus,
  UpdatePaymentSettingsDto,
  CreatePaymentDto,
  TestConnectionResponse,
} from './interfaces/payment.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
  private readonly NOWPAYMENTS_SANDBOX_URL = 'https://api-sandbox.nowpayments.io/v1';

  constructor(
    @Inject(FirebaseConfig)
    private readonly firebaseConfig: FirebaseConfig,
    private readonly walletsService: WalletsService,
    private readonly threePayService: ThreePayService,
  ) {}

  private get firestore(): admin.firestore.Firestore {
    return this.firebaseConfig.getFirestore();
  }

  /**
   * Get payment settings
   */
  async getPaymentSettings(): Promise<PaymentSettings | null> {
    try {
      const doc = await this.firestore
        .collection('payment_settings')
        .doc('default')
        .get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data();
      if (!data) {
        return null;
      }

      return {
        id: doc.id,
        provider: data.provider || 'nowpayments',
        apiKey: data.apiKey || '',
        ipnSecret: data.ipnSecret,
        nowPaymentsWallet: data.nowPaymentsWallet,
        isTestMode: data.isTestMode ?? true,
        isActive: data.isActive ?? false,
        acceptedCurrencies: data.acceptedCurrencies || ['usdttrc20'],
        cryptoEnabled: data.cryptoEnabled ?? true,
        cardEnabled: data.cardEnabled ?? false,
        stripePublicKey: data.stripePublicKey,
        stripeSecretKey: data.stripeSecretKey,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastTestedAt: data.lastTestedAt?.toDate(),
        testStatus: data.testStatus,
        testMessage: data.testMessage,
      };
    } catch (error) {
      console.error('Error fetching payment settings:', error);
      throw new BadRequestException('Failed to fetch payment settings');
    }
  }

  /**
   * Update payment settings
   */
  async updatePaymentSettings(
    updateDto: UpdatePaymentSettingsDto,
  ): Promise<PaymentSettings> {
    try {
      const existing = await this.getPaymentSettings();

      const settingsData: any = {
        provider: 'nowpayments',
        apiKey: updateDto.apiKey ?? (existing?.apiKey || ''),
        ipnSecret: updateDto.ipnSecret ?? (existing?.ipnSecret || ''),
        nowPaymentsWallet: updateDto.nowPaymentsWallet ?? (existing?.nowPaymentsWallet || ''),
        isTestMode: updateDto.isTestMode ?? (existing?.isTestMode ?? true),
        isActive: updateDto.isActive ?? (existing?.isActive ?? false),
        acceptedCurrencies:
          updateDto.acceptedCurrencies ??
          (existing?.acceptedCurrencies || ['usdttrc20']),
        cryptoEnabled: updateDto.cryptoEnabled ?? (existing?.cryptoEnabled ?? true),
        cardEnabled: updateDto.cardEnabled ?? (existing?.cardEnabled ?? false),
        stripePublicKey: updateDto.stripePublicKey ?? (existing?.stripePublicKey || ''),
        stripeSecretKey: updateDto.stripeSecretKey ?? (existing?.stripeSecretKey || ''),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (existing) {
        // Update existing
        await this.firestore
          .collection('payment_settings')
          .doc('default')
          .update(settingsData);
      } else {
        // Create new
        settingsData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        await this.firestore
          .collection('payment_settings')
          .doc('default')
          .set(settingsData);
      }

      const updatedSettings = await this.getPaymentSettings();
      if (!updatedSettings) {
        throw new BadRequestException('Failed to retrieve updated settings');
      }
      return updatedSettings;
    } catch (error) {
      console.error('Error updating payment settings:', error);
      throw new BadRequestException('Failed to update payment settings');
    }
  }

  /**
   * Test Stripe API connection
   */
  async testStripeConnection(secretKey: string): Promise<TestConnectionResponse> {
    try {
      // Test Stripe API by creating a simple API call
      const response = await axios.get('https://api.stripe.com/v1/balance', {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
        },
      });

      if (response.data && response.data.object === 'balance') {
        return {
          success: true,
          message: 'Stripe connection successful! Your API key is valid.',
        };
      }

      return {
        success: false,
        message: 'Unexpected response from Stripe API',
      };
    } catch (error: any) {
      console.error('Error testing Stripe connection:', error);

      let errorMessage = 'Connection failed. ';
      if (error.response?.status === 401) {
        errorMessage += 'Invalid Stripe API key.';
      } else if (error.response?.data?.error?.message) {
        errorMessage += error.response.data.error.message;
      } else {
        errorMessage += error.message || 'Unknown error';
      }

      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Test NOWPayments API connection
   */
  async testConnection(apiKey: string, isTestMode: boolean): Promise<TestConnectionResponse> {
    try {
      const baseUrl = isTestMode
        ? this.NOWPAYMENTS_SANDBOX_URL
        : this.NOWPAYMENTS_API_URL;

      // Test API status
      const statusResponse = await axios.get(`${baseUrl}/status`, {
        headers: {
          'x-api-key': apiKey,
        },
      });

      if (statusResponse.data.message !== 'OK') {
        return {
          success: false,
          message: 'API is not responding correctly',
        };
      }

      let availableCurrencies: string[] = [];
      let minAmount = 1;

      // Try to get currencies (may fail in sandbox with production key)
      try {
        const currenciesResponse = await axios.get(`${baseUrl}/currencies`, {
          headers: {
            'x-api-key': apiKey,
          },
        });
        availableCurrencies = currenciesResponse.data.currencies || [];
      } catch (error) {
        console.warn('⚠️ Could not fetch currencies (may be using wrong API key for mode)');
        availableCurrencies = ['usdttrc20', 'usdterc20', 'btc']; // Default fallback
      }

      const usdtCurrencies = availableCurrencies.filter((c: string) =>
        c.toLowerCase().includes('usdt'),
      );

      // Try to get minimum payment amount
      try {
        const minAmountResponse = await axios.get(
          `${baseUrl}/min-amount?currency_from=usd&currency_to=usdttrc20`,
          {
            headers: {
              'x-api-key': apiKey,
            },
          },
        );
        minAmount = minAmountResponse.data.min_amount || 1;
      } catch (error) {
        console.warn('⚠️ Could not fetch minimum amount');
        minAmount = 1;
      }

      // Update test status in database
      const settings = await this.getPaymentSettings();
      if (settings) {
        await this.firestore
          .collection('payment_settings')
          .doc(settings.id)
          .update({
            lastTestedAt: admin.firestore.FieldValue.serverTimestamp(),
            testStatus: 'success',
            testMessage: 'Connection successful',
          });
      }

      const mode = isTestMode ? 'SANDBOX' : 'PRODUCTION';
      const warning = isTestMode && availableCurrencies.length === 3 
        ? ' ⚠️ Note: Using production API key in test mode may cause issues. Get a sandbox key from https://sandbox.nowpayments.io/' 
        : '';

      return {
        success: true,
        message: `Connection successful! API is working correctly in ${mode} mode.${warning}`,
        availableCurrencies: usdtCurrencies,
        minAmount,
      };
    } catch (error: any) {
      console.error('Error testing NOWPayments connection:', error);

      // Update test status in database
      const settings = await this.getPaymentSettings();
      if (settings) {
        await this.firestore
          .collection('payment_settings')
          .doc(settings.id)
          .update({
            lastTestedAt: admin.firestore.FieldValue.serverTimestamp(),
            testStatus: 'failed',
            testMessage: error.response?.data?.message || error.message || 'Connection failed',
          });
      }

      let errorMessage = 'Connection failed. ';
      if (error.response?.status === 401) {
        errorMessage += 'Invalid API key.';
      } else if (error.response?.data?.message) {
        errorMessage += error.response.data.message;
      } else {
        errorMessage += error.message || 'Unknown error';
      }

      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Create a payment
   */
  async createPayment(
    userId: string,
    createPaymentDto: CreatePaymentDto,
  ): Promise<PaymentTransaction> {
    try {
      // ⚡ TEST MODE: Skip NowPayments API and auto-approve
      const TEST_MODE = true; // Set to false when integrating 3pay
      
      if (TEST_MODE) {
        console.log('🧪 [PAYMENTS] TEST MODE - Skipping NowPayments API');
        
        const testPaymentId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create test transaction
        const transaction: any = {
          userId,
          orderId: createPaymentDto.orderId,
          amount: createPaymentDto.amount,
          currency: createPaymentDto.currency,
          payCurrency: createPaymentDto.payCurrency,
          payAmount: createPaymentDto.amount, // Same as price in test mode
          status: PaymentStatus.WAITING,
          paymentId: testPaymentId,
          payAddress: 'test_address_no_payment_needed',
          paymentUrl: '',
          testMode: true, // Flag to indicate test mode
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: null,
        };

        const docRef = await this.firestore.collection('payment_transactions').add(transaction);

        console.log('✅ [PAYMENTS] Test payment created:', testPaymentId);

        return {
          id: docRef.id,
          ...transaction,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as PaymentTransaction;
      }

      // PRODUCTION MODE: Use NowPayments API
      const settings = await this.getPaymentSettings();

      if (!settings || !settings.isActive) {
        throw new BadRequestException('Payment system is not configured or inactive');
      }

      if (!settings.apiKey) {
        throw new BadRequestException('Payment API key is not configured');
      }

      const baseUrl = settings.isTestMode
        ? this.NOWPAYMENTS_SANDBOX_URL
        : this.NOWPAYMENTS_API_URL;

      // Create payment with NOWPayments
      const response = await axios.post(
        `${baseUrl}/payment`,
        {
          price_amount: createPaymentDto.amount,
          price_currency: createPaymentDto.currency,
          pay_currency: createPaymentDto.payCurrency,
          order_id: createPaymentDto.orderId,
          order_description: createPaymentDto.description || 'Payment',
          ipn_callback_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/payments/webhook`,
        },
        {
          headers: {
            'x-api-key': settings.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      const paymentData = response.data;

      // Save transaction to database
      const transaction: any = {
        userId,
        orderId: createPaymentDto.orderId,
        amount: createPaymentDto.amount,
        currency: createPaymentDto.currency,
        payCurrency: createPaymentDto.payCurrency,
        payAmount: paymentData.pay_amount,
        status: PaymentStatus.WAITING,
        paymentId: paymentData.payment_id,
        payAddress: paymentData.pay_address,
        paymentUrl: paymentData.invoice_url || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: paymentData.expiration_estimate_date
          ? new Date(paymentData.expiration_estimate_date)
          : null,
      };

      const docRef = await this.firestore
        .collection('payment_transactions')
        .add(transaction);

      const savedDoc = await docRef.get();
      const savedData = savedDoc.data();

      if (!savedData) {
        throw new BadRequestException('Failed to retrieve saved transaction');
      }

      return {
        id: savedDoc.id,
        userId: savedData.userId,
        orderId: savedData.orderId,
        amount: savedData.amount,
        currency: savedData.currency,
        payCurrency: savedData.payCurrency,
        payAmount: savedData.payAmount,
        paymentMethod: savedData.paymentMethod || 'crypto',
        status: savedData.status,
        paymentId: savedData.paymentId,
        payAddress: savedData.payAddress,
        paymentUrl: savedData.paymentUrl,
        createdAt: savedData.createdAt?.toDate() || new Date(),
        updatedAt: savedData.updatedAt?.toDate() || new Date(),
        expiresAt: savedData.expiresAt?.toDate(),
      };
    } catch (error: any) {
      console.error('Error creating payment:', error);
      throw new BadRequestException(
        error.response?.data?.message || 'Failed to create payment',
      );
    }
  }

  /**
   * Get all transactions
   */
  async getAllTransactions(): Promise<PaymentTransaction[]> {
    try {
      const snapshot = await this.firestore
        .collection('payment_transactions')
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId,
          orderId: data.orderId,
          amount: data.amount,
          currency: data.currency,
          payCurrency: data.payCurrency,
          payAmount: data.payAmount,
          paymentMethod: data.paymentMethod || 'crypto',
          status: data.status,
          paymentId: data.paymentId,
          payAddress: data.payAddress,
          paymentUrl: data.paymentUrl,
          actuallyPaid: data.actuallyPaid,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          expiresAt: data.expiresAt?.toDate(),
          completedAt: data.completedAt?.toDate(),
        };
      });
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new BadRequestException('Failed to fetch transactions');
    }
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(): Promise<any> {
    try {
      const transactions = await this.getAllTransactions();

      // Filter completed transactions only
      const completedTransactions = transactions.filter(
        (t) => t.status === PaymentStatus.FINISHED || t.status === PaymentStatus.CONFIRMED,
      );

      // Calculate stats
      const cryptoTransactions = completedTransactions.filter((t) => t.paymentMethod === 'crypto');
      const cardTransactions = completedTransactions.filter((t) => t.paymentMethod === 'card');

      const cryptoIncome = cryptoTransactions.reduce((sum, t) => sum + (t.actuallyPaid || t.amount), 0);
      const cardIncome = cardTransactions.reduce((sum, t) => sum + (t.actuallyPaid || t.amount), 0);

      const pendingTransactions = transactions.filter(
        (t) => t.status === PaymentStatus.PENDING || t.status === PaymentStatus.WAITING,
      );

      const failedTransactions = transactions.filter(
        (t) => t.status === PaymentStatus.FAILED || t.status === PaymentStatus.EXPIRED,
      );

      // Get cashout/expense data from wallets
      const allWallets = await this.walletsService.getAllWallets();
      const systemWallet = allWallets.find(w => w.ownerType === 'system');
      const coachWallets = allWallets.filter(w => w.ownerType === 'coach');
      
      // Calculate total expenses (cashouts to coaches)
      let totalExpenses = 0;
      let totalCashouts = 0;
      
      for (const wallet of coachWallets) {
        const transactions = await this.walletsService.getWalletTransactions(wallet.id);
        const cashoutTransactions = transactions.filter(t => t.referenceType === 'cashout' && t.type === 'debit');
        totalExpenses += cashoutTransactions.reduce((sum, t) => sum + t.amount, 0);
        totalCashouts += cashoutTransactions.length;
      }

      const totalIncome = cryptoIncome + cardIncome;
      const netIncome = totalIncome - totalExpenses;

      return {
        totalIncome,
        cryptoIncome,
        cardIncome,
        totalTransactions: transactions.length,
        cryptoTransactions: cryptoTransactions.length,
        cardTransactions: cardTransactions.length,
        successfulTransactions: completedTransactions.length,
        failedTransactions: failedTransactions.length,
        pendingTransactions: pendingTransactions.length,
        totalExpenses,
        totalCashouts,
        netIncome,
      };
    } catch (error) {
      console.error('Error calculating payment stats:', error);
      throw new BadRequestException('Failed to calculate payment stats');
    }
  }

  /**
   * Create a payment with NOWPayments API
   */
  async createNowPayment(
    price: number,
    payCurrency: string,
    orderId: string,
    description?: string,
  ): Promise<any> {
    try {
      const settings = await this.getPaymentSettings();

      if (!settings || !settings.apiKey) {
        throw new BadRequestException('NOWPayments API key not configured');
      }

      if (!settings.isActive) {
        throw new BadRequestException('Payment system is not active');
      }

      const apiUrl = settings.isTestMode
        ? this.NOWPAYMENTS_SANDBOX_URL
        : this.NOWPAYMENTS_API_URL;

      console.log(`💰 [PAYMENTS] Creating NOWPayments payment for order ${orderId}`);
      console.log(`   Mode: ${settings.isTestMode ? 'TEST' : 'PRODUCTION'}`);
      console.log(`   Amount: $${price} ${payCurrency.toUpperCase()}`);

      const response = await axios.post(
        `${apiUrl}/payment`,
        {
          price_amount: price,
          price_currency: 'usd',
          pay_currency: payCurrency,
          ipn_callback_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/payments/webhook`,
          order_id: orderId,
          order_description: description || `Subscription payment #${orderId}`,
        },
        {
          headers: {
            'x-api-key': settings.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('✅ [PAYMENTS] NOWPayments payment created:', response.data.payment_id);

      return {
        paymentId: response.data.payment_id,
        paymentAddress: response.data.pay_address,
        payAmount: response.data.pay_amount,
        payCurrency: response.data.pay_currency,
        paymentStatus: response.data.payment_status,
        invoiceUrl: response.data.invoice_url,
        expirationEstimateDate: response.data.expiration_estimate_date,
      };
    } catch (error: any) {
      console.error('❌ [PAYMENTS] Error creating NOWPayments payment:', error.response?.data || error.message);
      throw new BadRequestException(
        error.response?.data?.message || 'Failed to create payment with NOWPayments',
      );
    }
  }

  /**
   * Get payment status from NOWPayments
   */
  async getPaymentStatus(paymentId: string): Promise<any> {
    try {
      const settings = await this.getPaymentSettings();

      if (!settings || !settings.apiKey) {
        throw new BadRequestException('NOWPayments API key not configured');
      }

      const apiUrl = settings.isTestMode
        ? this.NOWPAYMENTS_SANDBOX_URL
        : this.NOWPAYMENTS_API_URL;

      const response = await axios.get(`${apiUrl}/payment/${paymentId}`, {
        headers: {
          'x-api-key': settings.apiKey,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('❌ [PAYMENTS] Error getting payment status:', error.response?.data || error.message);
      throw new BadRequestException('Failed to get payment status');
    }
  }

  /**
   * Create a payout with NOWPayments API (for cashouts)
   */
  async createPayout(
    address: string,
    currency: string,
    amount: number,
  ): Promise<any> {
    try {
      const settings = await this.getPaymentSettings();

      if (!settings || !settings.apiKey) {
        throw new BadRequestException('NOWPayments API key not configured');
      }

      if (!settings.isActive) {
        throw new BadRequestException('Payment system is not active');
      }

      const apiUrl = settings.isTestMode
        ? this.NOWPAYMENTS_SANDBOX_URL
        : this.NOWPAYMENTS_API_URL;

      console.log(`💸 [PAYMENTS] Creating NOWPayments payout`);
      console.log(`   Mode: ${settings.isTestMode ? 'TEST' : 'PRODUCTION'}`);
      console.log(`   Amount: ${amount} ${currency.toUpperCase()}`);
      console.log(`   Address: ${address}`);

      const response = await axios.post(
        `${apiUrl}/payout`,
        {
          withdrawals: [
            {
              address,
              currency: currency.toLowerCase(),
              amount,
            },
          ],
        },
        {
          headers: {
            'x-api-key': settings.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('✅ [PAYMENTS] NOWPayments payout created:', response.data.id);

      return response.data;
    } catch (error: any) {
      console.error('❌ [PAYMENTS] Error creating NOWPayments payout:', error.response?.data || error.message);
      throw new BadRequestException(
        error.response?.data?.message || 'Failed to create payout with NOWPayments',
      );
    }
  }

  /**
   * Handle NOWPayments webhook (IPN - Instant Payment Notification)
   */
  async handleNowPaymentsWebhook(payload: any, signature: string): Promise<any> {
    try {
      console.log('🔔 [PAYMENTS] Webhook received:', payload);

      const settings = await this.getPaymentSettings();

      // Verify webhook signature if IPN secret is configured
      if (settings?.ipnSecret && signature) {
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha512', settings.ipnSecret);
        const calculatedSignature = hmac.update(JSON.stringify(payload)).digest('hex');

        if (calculatedSignature !== signature) {
          console.error('❌ [PAYMENTS] Invalid webhook signature');
          throw new BadRequestException('Invalid webhook signature');
        }
        console.log('✅ [PAYMENTS] Webhook signature verified');
      }

      const { payment_status, order_id, payment_id, actually_paid } = payload;

      console.log(`📊 [PAYMENTS] Payment status: ${payment_status} for order: ${order_id}`);

      // Update pending payment status in Firestore
      const pendingPaymentQuery = await this.firestore
        .collection('pending_payments')
        .where('paymentId', '==', payment_id)
        .limit(1)
        .get();

      if (!pendingPaymentQuery.empty) {
        const pendingPaymentDoc = pendingPaymentQuery.docs[0];
        const pendingPaymentId = pendingPaymentDoc.id;

        // Map NOWPayments status to our status
        let ourStatus = 'waiting';
        if (payment_status === 'finished' || payment_status === 'confirmed') {
          ourStatus = 'completed';
        } else if (payment_status === 'failed' || payment_status === 'expired') {
          ourStatus = 'failed';
        } else if (payment_status === 'sending' || payment_status === 'confirming') {
          ourStatus = 'confirming';
        }

        await this.firestore.collection('pending_payments').doc(pendingPaymentId).update({
          status: ourStatus,
          paymentStatus: payment_status,
          actuallyPaid: actually_paid || 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`✅ [PAYMENTS] Updated pending payment ${pendingPaymentId} to status: ${ourStatus}`);

        // If payment is completed, trigger subscription creation
        if (ourStatus === 'completed') {
          console.log('💎 [PAYMENTS] Payment completed! Creating subscription...');
          
          // Note: Actual subscription creation will be triggered by the confirm-payment endpoint
          // This webhook just records the payment status
          console.log('✅ [PAYMENTS] Payment status updated - subscription will be created via confirm endpoint');
        }
      } else {
        console.warn('⚠️ [PAYMENTS] No pending payment found for payment_id:', payment_id);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ [PAYMENTS] Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Handle 3pa-y webhook callback
   * CRITICAL: Always verify with 3pa-y API before processing
   */
  async handleThreePayCallback(body: any) {
    try {
      this.logger.log('🔔 [3PAY WEBHOOK] Processing callback...');
      this.logger.log('📦 [3PAY WEBHOOK] Payload:', JSON.stringify(body));

      // Extract transaction ID from callback
      const transactionId = body.transactionId || body.transaction_id || body.id;
      
      if (!transactionId) {
        this.logger.error('❌ [3PAY WEBHOOK] No transaction ID in callback');
        throw new BadRequestException('Missing transaction ID');
      }

      // SECURITY: Verify the transaction with 3pa-y API
      this.logger.log(`🔒 [3PAY WEBHOOK] Verifying transaction: ${transactionId}`);
      const verification = await this.threePayService.verifyCallback(transactionId);

      if (!verification.isValid) {
        this.logger.error('❌ [3PAY WEBHOOK] Invalid callback - verification failed');
        throw new BadRequestException('Invalid callback');
      }

      if (!verification.isPaid) {
        this.logger.warn('⚠️ [3PAY WEBHOOK] Transaction not paid yet');
        return { success: true, message: 'Transaction not completed yet' };
      }

      // Process the payment
      this.logger.log('💳 [3PAY WEBHOOK] Payment verified - processing...');
      await this.processVerifiedPayment(transactionId, verification.transaction);

      return { success: true, message: 'Payment processed successfully' };
    } catch (error) {
      this.logger.error('❌ [3PAY WEBHOOK] Error:', error);
      throw error;
    }
  }

  /**
   * Manually verify and process a 3pa-y payment
   * Used for debugging or manual verification
   */
  async verifyAndProcessPayment(transactionId: string) {
    try {
      this.logger.log(`🔍 [3PAY] Manual verification: ${transactionId}`);

      // Verify with 3pa-y
      const verification = await this.threePayService.verifyCallback(transactionId);

      if (!verification.isValid) {
        throw new BadRequestException('Invalid transaction');
      }

      if (!verification.isPaid) {
        return { 
          success: false, 
          message: 'Transaction not completed',
          status: verification.transaction?.status 
        };
      }

      // Process payment
      await this.processVerifiedPayment(transactionId, verification.transaction);

      return { 
        success: true, 
        message: 'Payment verified and processed',
        transaction: verification.transaction 
      };
    } catch (error) {
      this.logger.error('❌ [3PAY] Verification error:', error);
      throw error;
    }
  }

  /**
   * Process a verified 3pa-y payment
   * This activates subscriptions and processes wallet transactions
   */
  private async processVerifiedPayment(transactionId: string, transactionData: any) {
    try {
      this.logger.log(`💎 [3PAY] Processing verified payment: ${transactionId}`);

      // Find pending payment in Firestore
      const pendingPaymentQuery = await this.firestore
        .collection('pending_payments')
        .where('threePayTransactionId', '==', transactionId)
        .limit(1)
        .get();

      if (pendingPaymentQuery.empty) {
        this.logger.error(`❌ [3PAY] No pending payment found for transaction: ${transactionId}`);
        throw new NotFoundException('Pending payment not found');
      }

      const pendingPaymentDoc = pendingPaymentQuery.docs[0];
      const pendingPaymentData = pendingPaymentDoc.data();
      const pendingPaymentId = pendingPaymentDoc.id;

      this.logger.log(`✅ [3PAY] Found pending payment: ${pendingPaymentId}`);
      this.logger.log(`👤 [3PAY] User ID: ${pendingPaymentData.userId}`);
      this.logger.log(`📦 [3PAY] Type: ${pendingPaymentData.type}`);

      // Check if already processed
      if (pendingPaymentData.status === 'completed') {
        this.logger.warn('⚠️ [3PAY] Payment already processed');
        return;
      }

      const paymentType = pendingPaymentData.type; // 'subscription', 'renewal', 'upgrade', 'downgrade'

      // Process based on payment type
      if (paymentType === 'subscription') {
        await this.processSubscriptionPayment(pendingPaymentId, pendingPaymentData);
      } else if (paymentType === 'renewal') {
        await this.processRenewalPayment(pendingPaymentId, pendingPaymentData);
      } else if (paymentType === 'upgrade' || paymentType === 'downgrade') {
        await this.processUpgradePayment(pendingPaymentId, pendingPaymentData);
      }

      // Mark pending payment as completed
      await this.firestore.collection('pending_payments').doc(pendingPaymentId).update({
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        threePayStatus: transactionData.status,
      });

      this.logger.log(`✅ [3PAY] Payment processed successfully: ${pendingPaymentId}`);
    } catch (error) {
      this.logger.error('❌ [3PAY] Error processing payment:', error);
      throw error;
    }
  }

  /**
   * Process new subscription payment
   */
  private async processSubscriptionPayment(pendingPaymentId: string, pendingPaymentData: any) {
    this.logger.log('📋 [3PAY] Processing NEW subscription payment...');

    const { userId, strategyId, amount, coachCommissionPercentage } = pendingPaymentData;

    // Create ACTIVE subscription
    const strategyDoc = await this.firestore.collection('strategies').doc(strategyId).get();
    const strategyData = strategyDoc.data();

    const userDoc = await this.firestore.collection('users').doc(userId).get();
    const userData = userDoc.data();

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const subscriptionRef = await this.firestore.collection('subscriptions').add({
      userId,
      userName: userData?.displayName || userData?.name || 'Unknown',
      userEmail: userData?.email || '',
      strategyId,
      strategyName: strategyData?.name || 'Unknown',
      strategyNumber: strategyData?.strategyNumber || 0,
      strategyPrice: strategyData?.price || 0,
      status: 'ACTIVE', // Make it ACTIVE
      startDate: admin.firestore.Timestamp.fromDate(startDate),
      endDate: admin.firestore.Timestamp.fromDate(endDate),
      completedVideos: [],
      totalVideos: 0,
      progressPercentage: 0,
      videoProgress: [],
      coachCommissionPercentage: coachCommissionPercentage || 30,
      paymentMethod: 'automatic', // 3pa-y payment
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    this.logger.log(`✅ [3PAY] ACTIVE subscription created: ${subscriptionRef.id}`);

    // Process wallet payment with commission
    await this.walletsService.processSubscriptionPayment(
      subscriptionRef.id,
      userId,
      userData?.displayName || userData?.name || 'Unknown',
      strategyData?.name || 'Unknown',
      amount,
      userData?.assignedCoachId,
      userData?.assignedCoachName,
      coachCommissionPercentage || 30,
      'automatic', // automatic payment
    );

    this.logger.log('💰 [3PAY] Wallet payment processed with commission split');
  }

  /**
   * Process renewal payment
   */
  private async processRenewalPayment(pendingPaymentId: string, pendingPaymentData: any) {
    this.logger.log('🔄 [3PAY] Processing RENEWAL payment...');

    const { userId, amount, coachCommissionPercentage } = pendingPaymentData;

    // Find pending subscription
    const pendingSubQuery = await this.firestore
      .collection('subscriptions')
      .where('userId', '==', userId)
      .where('status', '==', 'PENDING')
      .limit(1)
      .get();

    if (pendingSubQuery.empty) {
      throw new NotFoundException('No pending subscription found');
    }

    const pendingSubDoc = pendingSubQuery.docs[0];
    const pendingSubData = pendingSubDoc.data();
    const pendingSubId = pendingSubDoc.id;

    // Make subscription ACTIVE with new 30-day period
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + 30);

    await this.firestore.collection('subscriptions').doc(pendingSubId).update({
      status: 'ACTIVE',
      endDate: admin.firestore.Timestamp.fromDate(newEndDate),
      paymentMethod: 'automatic',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    this.logger.log(`✅ [3PAY] Subscription renewed to ACTIVE: ${pendingSubId}`);

    // Process wallet payment
    const userDoc = await this.firestore.collection('users').doc(userId).get();
    const userData = userDoc.data();

    await this.walletsService.processSubscriptionPayment(
      pendingSubId,
      userId,
      userData?.displayName || userData?.name || 'Unknown',
      pendingSubData.strategyName,
      amount,
      userData?.assignedCoachId,
      userData?.assignedCoachName,
      coachCommissionPercentage || 30,
      'automatic',
    );

    this.logger.log('💰 [3PAY] Renewal payment processed');
  }

  /**
   * Process upgrade/downgrade payment
   */
  private async processUpgradePayment(pendingPaymentId: string, pendingPaymentData: any) {
    this.logger.log('🔼 [3PAY] Processing UPGRADE/DOWNGRADE payment...');

    const { userId, strategyId, currentSubscriptionId, amount, coachCommissionPercentage } = pendingPaymentData;

    // Get new strategy data
    const newStrategyDoc = await this.firestore.collection('strategies').doc(strategyId).get();
    const newStrategyData = newStrategyDoc.data();

    // Update subscription: new strategy + ACTIVE + new 30-day period
    const newStartDate = new Date();
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + 30);

    await this.firestore.collection('subscriptions').doc(currentSubscriptionId).update({
      strategyId,
      strategyName: newStrategyData?.name,
      strategyNumber: newStrategyData?.strategyNumber || 0,
      strategyPrice: newStrategyData?.price || 0,
      status: 'ACTIVE', // Make it ACTIVE
      startDate: admin.firestore.Timestamp.fromDate(newStartDate),
      endDate: admin.firestore.Timestamp.fromDate(newEndDate),
      completedVideos: [], // Reset progress
      coachCommissionPercentage,
      paymentMethod: 'automatic',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    this.logger.log(`✅ [3PAY] Subscription upgraded to ACTIVE: ${currentSubscriptionId}`);

    // Process wallet payment if amount > 0
    if (amount > 0) {
      const userDoc = await this.firestore.collection('users').doc(userId).get();
      const userData = userDoc.data();

      await this.walletsService.processSubscriptionPayment(
        currentSubscriptionId,
        userId,
        userData?.name || 'Unknown',
        newStrategyData?.name || 'Unknown',
        amount,
        userData?.assignedCoachId,
        userData?.assignedCoachName,
        coachCommissionPercentage || 30,
        'automatic',
      );

      this.logger.log('💰 [3PAY] Upgrade payment processed');
    }
  }
}
