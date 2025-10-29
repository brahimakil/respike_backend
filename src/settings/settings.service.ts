import { Injectable, Inject } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseConfig } from '../database/firebase/firebase.config';

export interface AppSettings {
  telegram: {
    enabled: boolean;
    type: 'personal' | 'group' | 'channel';
    link: string;
    label: string;
  };
  banner: {
    imageUrl: string;
    text: string;
    textColor: string;
    fontSize: number;
    fontFamily: string;
    overlayEnabled: boolean;
    overlayColor: string;
    overlayOpacity: number;
  };
}

@Injectable()
export class SettingsService {
  private firestore: admin.firestore.Firestore;
  private readonly SETTINGS_DOC_ID = 'app_settings';

  constructor(@Inject(FirebaseConfig) private firebaseConfig: FirebaseConfig) {
    this.firestore = this.firebaseConfig.getFirestore();
  }

  /**
   * Get application settings
   */
  async getSettings(): Promise<AppSettings> {
    try {
      const doc = await this.firestore
        .collection('settings')
        .doc(this.SETTINGS_DOC_ID)
        .get();

      if (!doc.exists) {
        // Return default settings
        return this.getDefaultSettings();
      }

      return doc.data() as AppSettings;
    } catch (error) {
      console.error('❌ [SETTINGS] Error fetching settings:', error);
      return this.getDefaultSettings();
    }
  }

  /**
   * Update application settings
   */
  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    try {
      console.log('🔧 [SETTINGS] Updating settings:', settings);

      const currentSettings = await this.getSettings();
      const updatedSettings = {
        ...currentSettings,
        ...settings,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await this.firestore
        .collection('settings')
        .doc(this.SETTINGS_DOC_ID)
        .set(updatedSettings, { merge: true });

      console.log('✅ [SETTINGS] Settings updated successfully');

      return updatedSettings as AppSettings;
    } catch (error) {
      console.error('❌ [SETTINGS] Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Get default settings
   */
  private getDefaultSettings(): AppSettings {
    return {
      telegram: {
        enabled: false,
        type: 'group',
        link: '',
        label: 'Join our Telegram',
      },
      banner: {
        imageUrl: '',
        text: 'Welcome to Our Platform',
        textColor: '#ffffff',
        fontSize: 48,
        fontFamily: 'Inter, sans-serif',
        overlayEnabled: true,
        overlayColor: '#000000',
        overlayOpacity: 0.4,
      },
    };
  }
}

