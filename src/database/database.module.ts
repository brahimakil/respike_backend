import { Module, DynamicModule, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.interface';
import { FirebaseConfig } from './firebase/firebase.config';
import { FirebaseDatabaseService } from './firebase/firebase-database.service';

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [ConfigModule],
      providers: [
        FirebaseConfig,
        {
          provide: 'DATABASE_SERVICE',
          useFactory: (
            configService: ConfigService,
            firebaseConfig: FirebaseConfig,
          ): DatabaseService => {
            const dbType = configService.get('database.type');

            // Factory pattern to switch between different database implementations
            switch (dbType) {
              case 'firebase':
                return new FirebaseDatabaseService(firebaseConfig);
              case 'mongodb':
                // Future: return new MongoDBDatabaseService(mongoConfig);
                throw new Error('MongoDB implementation not yet available');
              default:
                throw new Error(`Unsupported database type: ${dbType}`);
            }
          },
          inject: [ConfigService, FirebaseConfig],
        },
      ],
      exports: ['DATABASE_SERVICE', FirebaseConfig],
    };
  }
}

