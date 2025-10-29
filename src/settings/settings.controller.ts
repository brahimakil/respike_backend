import { Controller, Get, Put, Body } from '@nestjs/common';
import { SettingsService, AppSettings } from './settings.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get()
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  async updateSettings(@Body() settings: Partial<AppSettings>) {
    return this.settingsService.updateSettings(settings);
  }
}

