import { Controller, Get, Param, UseGuards, Post, Body } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CashoutDto } from './dto/cashout.dto';

@Controller('wallets')
@UseGuards(AuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  async getAllWallets() {
    return this.walletsService.getAllWallets();
  }

  @Get('system')
  async getSystemWallet() {
    return this.walletsService.getSystemWallet();
  }

  @Get('commissions')
  async getAllCommissions() {
    return this.walletsService.getAllCommissions();
  }

  @Get(':id')
  async getWalletById(@Param('id') id: string) {
    return this.walletsService.getWalletById(id);
  }

  @Get(':id/transactions')
  async getWalletTransactions(@Param('id') id: string) {
    return this.walletsService.getWalletTransactions(id);
  }

  @Get('owner/:ownerId')
  async getWalletByOwnerId(@Param('ownerId') ownerId: string) {
    return this.walletsService.getWalletByOwnerId(ownerId);
  }

  @Post(':id/cashout')
  async cashoutWallet(@Param('id') id: string, @Body() cashoutDto: CashoutDto) {
    return this.walletsService.processCashout(id, cashoutDto);
  }
}

