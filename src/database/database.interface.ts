/**
 * Generic Database Interface
 * This abstraction allows switching between Firebase, MongoDB, or any other database
 * without changing the application logic
 */

export interface DatabaseService {
  // Collection/Table operations
  create<T>(collection: string, data: Partial<T>): Promise<T>;
  findOne<T>(collection: string, id: string): Promise<T | null>;
  findMany<T>(
    collection: string,
    query?: Record<string, any>,
    options?: QueryOptions,
  ): Promise<T[]>;
  update<T>(collection: string, id: string, data: Partial<T>): Promise<T>;
  delete(collection: string, id: string): Promise<void>;
  
  // Query building
  query<T>(collection: string): QueryBuilder<T>;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface QueryBuilder<T> {
  where(field: string, operator: WhereOperator, value: any): QueryBuilder<T>;
  orderBy(field: string, direction?: 'asc' | 'desc'): QueryBuilder<T>;
  limit(limit: number): QueryBuilder<T>;
  offset(offset: number): QueryBuilder<T>;
  execute(): Promise<T[]>;
  first(): Promise<T | null>;
}

export type WhereOperator =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not-in'
  | 'array-contains'
  | 'array-contains-any';

