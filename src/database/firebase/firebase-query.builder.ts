import { QueryBuilder, WhereOperator } from '../database.interface';
import * as admin from 'firebase-admin';

export class FirebaseQueryBuilder<T> implements QueryBuilder<T> {
  private firestoreQuery: admin.firestore.Query;

  constructor(
    private collectionRef: admin.firestore.CollectionReference,
    query?: admin.firestore.Query,
  ) {
    this.firestoreQuery = query || collectionRef;
  }

  where(
    field: string,
    operator: WhereOperator,
    value: any,
  ): QueryBuilder<T> {
    this.firestoreQuery = this.firestoreQuery.where(
      field,
      operator as admin.firestore.WhereFilterOp,
      value,
    );
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<T> {
    this.firestoreQuery = this.firestoreQuery.orderBy(
      field,
      direction,
    );
    return this;
  }

  limit(limit: number): QueryBuilder<T> {
    this.firestoreQuery = this.firestoreQuery.limit(limit);
    return this;
  }

  offset(offset: number): QueryBuilder<T> {
    this.firestoreQuery = this.firestoreQuery.offset(offset);
    return this;
  }

  async execute(): Promise<T[]> {
    const snapshot = await this.firestoreQuery.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];
  }

  async first(): Promise<T | null> {
    const results = await this.limit(1).execute();
    return results.length > 0 ? results[0] : null;
  }
}

