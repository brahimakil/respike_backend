export interface StrategyVideo {
  id: string;
  strategyId: string;
  order: number;
  title: string;
  description: string;
  videoUrl: string;
  bunnyVideoId?: string; // Bunny.net video ID for HLS streaming
  coverPhotoUrl?: string;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVideoDto {
  title: string;
  description: string;
  videoUrl: string;
  bunnyVideoId?: string; // Bunny.net video ID
  coverPhotoUrl?: string;
}

export interface UpdateVideoDto {
  order?: number;
  title?: string;
  description?: string;
  videoUrl?: string;
  bunnyVideoId?: string; // Bunny.net video ID
  coverPhotoUrl?: string;
  isVisible?: boolean;
}

