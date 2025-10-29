import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import * as admin from 'firebase-admin';
import { Admin, AdminStatus, UpdateAdminDto, DisableAdminDto } from './interfaces/admin.interface';

@Injectable()
export class AdminsService {
  constructor(
    @Inject(FirebaseConfig)
    private readonly firebaseConfig: FirebaseConfig,
  ) {}

  private get auth(): admin.auth.Auth {
    return this.firebaseConfig.getAuth();
  }

  private get firestore(): admin.firestore.Firestore {
    return this.firebaseConfig.getFirestore();
  }

  async getAllAdmins(): Promise<Admin[]> {
    try {
      const snapshot = await this.firestore.collection('admins').get();
      const admins: Admin[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        admins.push({
          uid: doc.id,
          email: data.email || '',
          displayName: data.displayName || null,
          emailVerified: data.emailVerified || false,
          role: data.role || 'admin',
          status: data.status || AdminStatus.ACTIVE,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          disabledAt: data.disabledAt?.toDate(),
          disabledBy: data.disabledBy,
          disabledReason: data.disabledReason,
        });
      }

      // Sort by creation date (newest first)
      admins.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return admins;
    } catch (error) {
      console.error('Error fetching admins:', error);
      throw new BadRequestException('Failed to fetch admins');
    }
  }

  async getAdminById(uid: string): Promise<Admin> {
    try {
      const doc = await this.firestore.collection('admins').doc(uid).get();

      if (!doc.exists) {
        throw new NotFoundException('Admin not found');
      }

      const data = doc.data();
      
      if (!data) {
        throw new NotFoundException('Admin data not found');
      }
      
      return {
        uid: doc.id,
        email: data.email || '',
        displayName: data.displayName || null,
        emailVerified: data.emailVerified || false,
        role: data.role || 'admin',
        status: data.status || AdminStatus.ACTIVE,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        disabledAt: data.disabledAt?.toDate(),
        disabledBy: data.disabledBy,
        disabledReason: data.disabledReason,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error fetching admin:', error);
      throw new BadRequestException('Failed to fetch admin');
    }
  }

  async updateAdmin(uid: string, updateAdminDto: UpdateAdminDto, currentAdminUid: string): Promise<Admin> {
    try {
      // Check if admin exists
      const adminDoc = await this.firestore.collection('admins').doc(uid).get();
      if (!adminDoc.exists) {
        throw new NotFoundException('Admin not found');
      }

      // Filter out undefined values
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (updateAdminDto.displayName !== undefined) {
        updateData.displayName = updateAdminDto.displayName;
        // Update in Firebase Auth too
        await this.auth.updateUser(uid, { displayName: updateAdminDto.displayName });
      }

      if (updateAdminDto.email !== undefined) {
        updateData.email = updateAdminDto.email;
        // Update in Firebase Auth too
        await this.auth.updateUser(uid, { email: updateAdminDto.email });
      }

      // Update in Firestore
      await this.firestore.collection('admins').doc(uid).update(updateData);

      return this.getAdminById(uid);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating admin:', error);
      throw new BadRequestException('Failed to update admin');
    }
  }

  async disableAdmin(uid: string, disableAdminDto: DisableAdminDto, currentAdminUid: string): Promise<Admin> {
    try {
      // Prevent self-disable
      if (uid === currentAdminUid) {
        throw new BadRequestException('You cannot disable your own account');
      }

      // Check if admin exists
      const adminDoc = await this.firestore.collection('admins').doc(uid).get();
      if (!adminDoc.exists) {
        throw new NotFoundException('Admin not found');
      }

      // Disable in Firebase Auth
      await this.auth.updateUser(uid, { disabled: true });

      // Update in Firestore
      await this.firestore.collection('admins').doc(uid).update({
        status: AdminStatus.DISABLED,
        disabledAt: admin.firestore.FieldValue.serverTimestamp(),
        disabledBy: currentAdminUid,
        disabledReason: disableAdminDto.reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return this.getAdminById(uid);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error disabling admin:', error);
      throw new BadRequestException('Failed to disable admin');
    }
  }

  async enableAdmin(uid: string, currentAdminUid: string): Promise<Admin> {
    try {
      // Check if admin exists
      const adminDoc = await this.firestore.collection('admins').doc(uid).get();
      if (!adminDoc.exists) {
        throw new NotFoundException('Admin not found');
      }

      // Enable in Firebase Auth
      await this.auth.updateUser(uid, { disabled: false });

      // Update in Firestore
      await this.firestore.collection('admins').doc(uid).update({
        status: AdminStatus.ACTIVE,
        disabledAt: admin.firestore.FieldValue.delete(),
        disabledBy: admin.firestore.FieldValue.delete(),
        disabledReason: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return this.getAdminById(uid);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error enabling admin:', error);
      throw new BadRequestException('Failed to enable admin');
    }
  }

  async deleteAdmin(uid: string, currentAdminUid: string): Promise<void> {
    try {
      // Prevent self-delete
      if (uid === currentAdminUid) {
        throw new BadRequestException('You cannot delete your own account');
      }

      // Check if admin exists
      const adminDoc = await this.firestore.collection('admins').doc(uid).get();
      if (!adminDoc.exists) {
        throw new NotFoundException('Admin not found');
      }

      // Delete from Firebase Auth
      await this.auth.deleteUser(uid);

      // Delete from Firestore
      await this.firestore.collection('admins').doc(uid).delete();
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error deleting admin:', error);
      throw new BadRequestException('Failed to delete admin');
    }
  }
}

