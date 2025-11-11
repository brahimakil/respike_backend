import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  Request,
  Query,
  Req,
  Headers,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('settings')
  @UseGuards(AuthGuard)
  async getSettings() {
    return this.paymentsService.getPaymentSettings();
  }

  @Put('settings')
  @UseGuards(AuthGuard)
  async updateSettings(@Body() updateDto: UpdatePaymentSettingsDto) {
    return this.paymentsService.updatePaymentSettings(updateDto);
  }

  @Post('test-connection')
  @UseGuards(AuthGuard)
  async testConnection(
    @Body() body: { apiKey: string; isTestMode: boolean },
  ) {
    return this.paymentsService.testConnection(body.apiKey, body.isTestMode);
  }

  @Post('test-stripe')
  @UseGuards(AuthGuard)
  async testStripeConnection(@Body() body: { secretKey: string }) {
    return this.paymentsService.testStripeConnection(body.secretKey);
  }

  @Post('create')
  @UseGuards(AuthGuard)
  async createPayment(
    @Request() req: any,
    @Body() createPaymentDto: CreatePaymentDto,
  ) {
    const userId = req.user.uid;
    return this.paymentsService.createPayment(userId, createPaymentDto);
  }

  @Get('transactions')
  @UseGuards(AuthGuard)
  async getAllTransactions() {
    return this.paymentsService.getAllTransactions();
  }

  @Get('stats')
  @UseGuards(AuthGuard)
  async getPaymentStats() {
    return this.paymentsService.getPaymentStats();
  }

  // Webhook endpoint for payment notifications (no auth required)
  @Public()
  @Post('webhook')
  async handleWebhook(@Body() body: any, @Headers('x-nowpayments-sig') signature: string) {
    return this.paymentsService.handleNowPaymentsWebhook(body, signature);
  }

  /**
   * 3pa-y webhook endpoint
   * This receives payment confirmations from 3pa-y
   * CRITICAL: Always verify the transaction with 3pa-y before processing
   */
  @Public()
  @Post('webhook/3pay')
  async handleThreePayWebhook(@Body() body: any) {
    return this.paymentsService.handleThreePayCallback(body);
  }

  /**
   * Manual transaction verification endpoint
   * Useful for debugging or manual checks
   */
  @Get('verify/3pay')
  @UseGuards(AuthGuard)
  async verifyThreePayTransaction(@Query('transactionId') transactionId: string) {
    return this.paymentsService.verifyAndProcessPayment(transactionId);
  }
}

