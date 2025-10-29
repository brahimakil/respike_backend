export interface Strategy {
  id: string;
  number: number; // Strategy number (unique)
  name: string;
  description: string;
  price: number;
  tags: string[];
  coverPhotoUrl?: string;
  expectedWeeks?: number;
  videoCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStrategyDto {
  name: string;
  description: string;
  price: number;
  tags: string[];
  coverPhotoUrl?: string;
}

export interface UpdateStrategyDto {
  number?: number;
  name?: string;
  description?: string;
  price?: number;
  tags?: string[];
  coverPhotoUrl?: string;
  expectedWeeks?: number;
}

