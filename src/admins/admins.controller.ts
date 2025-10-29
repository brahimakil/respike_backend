import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AdminsService } from './admins.service';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { DisableAdminDto } from './dto/disable-admin.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('admins')
@UseGuards(AuthGuard)
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  async getAllAdmins() {
    return this.adminsService.getAllAdmins();
  }

  @Get(':id')
  async getAdminById(@Param('id') id: string) {
    return this.adminsService.getAdminById(id);
  }

  @Put(':id')
  async updateAdmin(
    @Param('id') id: string,
    @Body() updateAdminDto: UpdateAdminDto,
    @Request() req: any,
  ) {
    const currentAdminUid = req.user.uid;
    return this.adminsService.updateAdmin(id, updateAdminDto, currentAdminUid);
  }

  @Patch(':id/disable')
  async disableAdmin(
    @Param('id') id: string,
    @Body() disableAdminDto: DisableAdminDto,
    @Request() req: any,
  ) {
    const currentAdminUid = req.user.uid;
    return this.adminsService.disableAdmin(id, disableAdminDto, currentAdminUid);
  }

  @Patch(':id/enable')
  async enableAdmin(@Param('id') id: string, @Request() req: any) {
    const currentAdminUid = req.user.uid;
    return this.adminsService.enableAdmin(id, currentAdminUid);
  }

  @Delete(':id')
  async deleteAdmin(@Param('id') id: string, @Request() req: any) {
    const currentAdminUid = req.user.uid;
    await this.adminsService.deleteAdmin(id, currentAdminUid);
    return { message: 'Admin deleted successfully' };
  }
}






