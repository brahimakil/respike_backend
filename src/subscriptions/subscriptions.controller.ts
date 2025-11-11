import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { UpdateVideoProgressDto } from './dto/update-video-progress.dto';

@Controller('subscriptions')
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  async getAllSubscriptions() {
    return this.subscriptionsService.getAllSubscriptions();
  }

  // Specific routes MUST come before parameterized routes
  @Get('my-subscription')
  async getMySubscription(@Req() req: any) {
    console.log('🔵 [CONTROLLER] my-subscription called for user:', req.user?.uid);
    console.log('🔵 [CONTROLLER] Full user object:', req.user);
    return this.subscriptionsService.getCurrentSubscriptionByUserId(req.user.uid);
  }

  @Get('user/:userId')
  async getActiveSubscriptionByUserId(@Param('userId') userId: string) {
    return this.subscriptionsService.getActiveSubscriptionByUserId(userId);
  }

  @Post('check-expired')
  async checkExpiredSubscriptions() {
    await this.subscriptionsService.checkExpiredSubscriptions();
    return { message: 'Checked and updated expired subscriptions' };
  }

  @Post('initiate')
  async initiateSubscription(@Req() req: any, @Body() body: any) {
    return this.subscriptionsService.initiateUserSubscription(
      req.user.uid,
      body.strategyId,
      body.walletAddress,
      body.currency,
    );
  }

  @Post('confirm-payment')
  async confirmPayment(@Body() body: any) {
    return this.subscriptionsService.confirmPayment(body.paymentId);
  }

  // ============================================
  // MY-SUBSCRIPTION ROUTES (User-facing)
  // MUST come before ANY :id routes
  // ============================================
  @Post('my-subscription/cancel')
  async cancelMySubscription(@Req() req: any) {
    return this.subscriptionsService.cancelUserSubscription(req.user.uid);
  }

  @Post('my-subscription/renew')
  async renewMySubscription(@Req() req: any, @Body() body: any) {
    return this.subscriptionsService.renewUserSubscription(
      req.user.uid,
      body.walletAddress,
      body.currency,
    );
  }

  @Post('my-subscription/upgrade')
  async upgradeMySubscription(@Req() req: any, @Body() body: any) {
    return this.subscriptionsService.upgradeUserSubscription(
      req.user.uid,
      body.newStrategyId,
      body.walletAddress,
      body.currency,
    );
  }

  @Get('my-subscription/video-progress')
  async getMyVideoProgress(@Req() req: any) {
    return this.subscriptionsService.getUserVideoProgress(req.user.uid);
  }

  @Post('my-subscription/complete-video')
  async completeVideo(@Req() req: any, @Body() body: any) {
    return this.subscriptionsService.markVideoComplete(
      req.user.uid,
      body.videoId,
    );
  }

  @Post('my-subscription/validate-video-access')
  async validateVideoAccess(@Req() req: any, @Body() body: any) {
    return this.subscriptionsService.validateVideoAccess(
      req.user.uid,
      body.videoId,
    );
  }

  // ============================================
  // PARAMETERIZED ROUTES (Admin-facing)
  // MUST come AFTER all specific routes
  // ============================================
  @Post()
  async createSubscription(@Body() createSubscriptionDto: CreateSubscriptionDto) {
    console.log('🎯 [CONTROLLER] Received createSubscription request:', {
      userId: createSubscriptionDto.userId,
      strategyId: createSubscriptionDto.strategyId,
      amountPaid: createSubscriptionDto.amountPaid,
      paymentMethod: createSubscriptionDto.paymentMethod,
      notes: createSubscriptionDto.notes,
      coachCommissionPercentage: createSubscriptionDto.coachCommissionPercentage,
      fullDto: createSubscriptionDto
    });
    return this.subscriptionsService.createSubscription(createSubscriptionDto);
  }

  @Get(':id')
  async getSubscriptionById(@Param('id') id: string) {
    return this.subscriptionsService.getSubscriptionById(id);
  }

  @Post(':id/renew')
  async renewSubscription(
    @Param('id') id: string,
    @Body() renewDto: RenewSubscriptionDto,
  ) {
    return this.subscriptionsService.renewSubscription(id, renewDto);
  }

  @Patch(':id/video-progress')
  async updateVideoProgress(
    @Param('id') id: string,
    @Body() progressDto: UpdateVideoProgressDto,
  ) {
    return this.subscriptionsService.updateVideoProgress(id, progressDto);
  }

  @Patch(':id/cancel')
  async cancelSubscription(@Param('id') id: string) {
    await this.subscriptionsService.cancelSubscription(id);
    return { message: 'Subscription cancelled successfully' };
  }

  @Patch(':id/set-pending')
  async setPendingSubscription(@Param('id') id: string) {
    await this.subscriptionsService.setPendingSubscription(id);
    return { message: 'Subscription set to pending successfully' };
  }

  @Delete(':id')
  async deleteSubscription(@Param('id') id: string) {
    await this.subscriptionsService.deleteSubscription(id);
    return { message: 'Subscription deleted successfully' };
  }
}

