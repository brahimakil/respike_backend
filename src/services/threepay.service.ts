import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ThreePayService {
  private readonly logger = new Logger(ThreePayService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly useSandbox: boolean;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('threepay.apiKey') || '';
    this.apiSecret = this.configService.get<string>('threepay.apiSecret') || '';
    this.useSandbox = this.configService.get<boolean>('threepay.useSandbox') || false;
    
    // Use sandbox or production URL
    this.baseUrl = this.useSandbox 
      ? 'https://sandbox.pay.3pa-y.com/api/v1'
      : 'https://pay.3pa-y.com/api/v1';

    this.logger.log('🔧 Initializing 3pa-y service...');
    this.logger.log(`🌐 Mode: ${this.useSandbox ? 'SANDBOX (Testing)' : 'PRODUCTION (Real Money)'}`);
    this.logger.log(`🔗 API URL: ${this.baseUrl}`);
    this.logger.log(`🔑 API Key: ${this.apiKey?.substring(0, 10)}...`);
    this.logger.log('✅ 3pa-y service initialized successfully');
  }

  /**
   * Create a new payment transaction
   * @param amount - Amount to charge (in USD)
   * @param currencyType - "USDT-TRC20" or "USDT-ERC20"
   * @param callbackUrl - Webhook URL to receive payment confirmation
   * @returns Transaction data with payment link
   */
  async createTransaction(params: {
    amount: number;
    currencyType: 'USDT-TRC20' | 'USDT-ERC20';
    callbackUrl: string;
  }) {
    try {
      this.logger.log('💳 [3PAY] Creating transaction...');
      this.logger.log(`💰 [3PAY] Amount: ${params.amount}`);
      this.logger.log(`💵 [3PAY] Currency: ${params.currencyType}`);
      this.logger.log(`🔔 [3PAY] Callback URL: ${params.callbackUrl}`);

      const url = `${this.baseUrl}/transaction/create?amount=${params.amount}&currencyType=${params.currencyType}&callbackUrl=${encodeURIComponent(params.callbackUrl)}`;
      
      const options = {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'x-api-secret': this.apiSecret,
          apiKey: this.apiKey,
          callbackUrl: params.callbackUrl,
        },
      };

      this.logger.log('🌐 [3PAY] Sending request to 3pa-y...');
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        this.logger.error('❌ [3PAY] Transaction creation failed:', data);
        throw new Error(`3pa-y API error: ${JSON.stringify(data)}`);
      }

      this.logger.log('✅ [3PAY] Transaction created successfully');
      this.logger.log('🔗 [3PAY] Payment link:', data.paymentUrl || data.payment_url);
      this.logger.log('🆔 [3PAY] Transaction ID:', data.transactionId || data.transaction_id);
      
      return data;
    } catch (error) {
      this.logger.error('❌ [3PAY] Error creating transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction status
   * @param transactionId - The transaction ID from 3pa-y
   * @returns Transaction details including status
   */
  async getTransaction(transactionId: string) {
    try {
      this.logger.log(`🔍 [3PAY] Fetching transaction: ${transactionId}`);
      
      const url = `${this.baseUrl}/transaction/get?transactionId=${transactionId}`;
      
      const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-api-secret': this.apiSecret,
          apiKey: this.apiKey,
        },
      };

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        this.logger.error('❌ [3PAY] Failed to fetch transaction:', data);
        throw new Error(`3pa-y API error: ${JSON.stringify(data)}`);
      }

      this.logger.log('✅ [3PAY] Transaction fetched');
      this.logger.log('📊 [3PAY] Full response:');
      this.logger.log(JSON.stringify(data, null, 2));
      this.logger.log('📊 [3PAY] Status field:', data.status);
      this.logger.log('📊 [3PAY] All keys:', Object.keys(data));
      
      return data;
    } catch (error) {
      this.logger.error('❌ [3PAY] Error fetching transaction:', error);
      throw error;
    }
  }

  /**
   * Verify payment callback authenticity
   * CRITICAL: Always verify callbacks by fetching transaction status from 3pa-y
   * to prevent fake webhook attacks
   */
  async verifyCallback(transactionId: string): Promise<{
    isValid: boolean;
    isPaid: boolean;
    transaction: any;
  }> {
    try {
      this.logger.log(`🔒 [3PAY] Verifying callback for: ${transactionId}`);
      
      // Fetch transaction directly from 3pa-y to verify it's legitimate
      const transaction = await this.getTransaction(transactionId);
      
      // 3pa-y has a typo in their API - they use "date" instead of "data"
      const transactionData = transaction.date || transaction.data;
      
      if (!transactionData) {
        this.logger.error('❌ [3PAY] No transaction data in response');
        return {
          isValid: false,
          isPaid: false,
          transaction: null,
        };
      }
      
      const status = transactionData.status;
      const actualBalance = transactionData.actualBalance || 0;
      const amount = transactionData.amount || 0;
      
      this.logger.log(`📊 [3PAY] Transaction status: ${status}`);
      this.logger.log(`💰 [3PAY] Expected amount: ${amount}`);
      this.logger.log(`💵 [3PAY] Actual balance received: ${actualBalance}`);
      
      // CRITICAL: Only mark as paid if:
      // 1. Status is completed/success/paid/confirmed AND
      // 2. Actual balance received >= expected amount (MONEY ACTUALLY RECEIVED!)
      const statusComplete = status === 'completed' || 
                            status === 'success' || 
                            status === 'paid' ||
                            status === 'confirmed';
      
      const moneyReceived = actualBalance >= amount;
      const isPaid = statusComplete && moneyReceived;
      
      if (!isPaid) {
        this.logger.warn(`⚠️ [3PAY] Payment NOT complete:`);
        this.logger.warn(`   Status complete: ${statusComplete} (status: ${status})`);
        this.logger.warn(`   Money received: ${moneyReceived} (${actualBalance}/${amount})`);
      }
      
      this.logger.log(`${isPaid ? '✅' : '❌'} [3PAY] Payment status: ${isPaid ? 'PAID ✅' : 'NOT PAID ❌'}`);
      
      return {
        isValid: true,
        isPaid,
        transaction: transactionData,
      };
    } catch (error) {
      this.logger.error('❌ [3PAY] Callback verification failed:', error);
      return {
        isValid: false,
        isPaid: false,
        transaction: null,
      };
    }
  }
}
