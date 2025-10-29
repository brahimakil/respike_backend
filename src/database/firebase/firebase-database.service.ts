import { Injectable } from '@nestjs/common';
import {
  DatabaseService,
  QueryBuilder,
  QueryOptions,
} from '../database.interface';
import { FirebaseConfig } from './firebase.config';
import { FirebaseQueryBuilder } from './firebase-query.builder';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseDatabaseService implements DatabaseService {
  private db: admin.firestore.Firestore;

  constructor(private firebaseConfig: FirebaseConfig) {
    this.db = this.firebaseConfig.getFirestore();
  }

  async create<T>(collection: string, data: Partial<T>): Promise<T> {
    const docRef = await this.db.collection(collection).add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as T;
  }

  async findOne<T>(collection: string, id: string): Promise<T | null> {
    const doc = await this.db.collection(collection).doc(id).get();
    
    if (!doc.exists) {
      return null;
    }

    return { id: doc.id, ...doc.data() } as T;
  }

  async findMany<T>(
    collection: string,
    query?: Record<string, any>,
    options?: QueryOptions,
  ): Promise<T[]> {
    let firestoreQuery: admin.firestore.Query = this.db.collection(collection);

    // Apply query filters
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        firestoreQuery = firestoreQuery.where(key, '==', value);
      });
    }

    // Apply options
    if (options?.orderBy) {
      firestoreQuery = firestoreQuery.orderBy(
        options.orderBy,
        options.orderDirection || 'asc',
      );
    }

    if (options?.limit) {
      firestoreQuery = firestoreQuery.limit(options.limit);
    }

    if (options?.offset) {
      firestoreQuery = firestoreQuery.offset(options.offset);
    }

    const snapshot = await firestoreQuery.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];
  }

  async update<T>(
    collection: string,
    id: string,
    data: Partial<T>,
  ): Promise<T> {
    const docRef = this.db.collection(collection).doc(id);
    
    await docRef.update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as T;
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.db.collection(collection).doc(id).delete();
  }

  query<T>(collection: string): QueryBuilder<T> {
    const collectionRef = this.db.collection(collection);
    return new FirebaseQueryBuilder<T>(collectionRef);
  }
}

