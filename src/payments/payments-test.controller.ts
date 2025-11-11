import { Controller, Post, Body, Logger } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * TEMPORARY TEST CONTROLLER
 * Use this to manually complete payments in sandbox mode
 * DELETE THIS FILE IN PRODUCTION
 */
@Controller('payments-test')
export class PaymentsTestController {
  private readonly logger = new Logger(PaymentsTestController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Force complete a payment (TESTING ONLY)
   * Use this when 3pa-y sandbox is slow to confirm
   */
  @Public()
  @Post('force-complete')
  async forceCompletePayment(@Body() body: { transactionId: string }) {
    this.logger.warn('⚠️ [TEST] FORCING PAYMENT COMPLETION - TESTING ONLY!');
    this.logger.warn(`⚠️ [TEST] Transaction ID: ${body.transactionId}`);

    try {
      // Create a fake "completed" transaction
      const fakeTransaction = {
        transactionId: body.transactionId,
        status: 'completed',
        success: true,
      };

      // Process it as if payment was verified
      await this.paymentsService['processVerifiedPayment'](body.transactionId, fakeTransaction);

      return { 
        success: true, 
        message: 'Payment forcefully completed for testing',
        warning: 'THIS IS A TEST BYPASS - DO NOT USE IN PRODUCTION'
      };
    } catch (error) {
      this.logger.error('❌ [TEST] Error forcing payment:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}
