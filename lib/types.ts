export interface ApiError extends Error {
  message: string;
  response?: {
    status: number;
  };
}

export interface Tag {
  name: string;
  category: string;
}

export interface Media {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string;
    userPreferred: string;
  };
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    medium: string | null;
  };
  startDate: { year: number | null; month: number | null; day: number | null };
  endDate: { year: number | null; month: number | null; day: number | null };
  bannerImage: string | null;
  season: string | null;
  seasonYear: number | null;
  description: string | null;
  type: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  duration: number | null;
  chapters: number | null;
  volumes: number | null;
  genres: string[] | null;
  isAdult: boolean | null;
  averageScore: number | null;
  popularity: number | null;
  studios: {
    nodes: {
      id: number;
      name: string;
    }[];
  } | null;
  tags:
    | {
        name: string;
        category: string;
      }[]
    | null;
  countryOfOrigin: string | null;
}

export interface MediaEntry {
  id: number;
  status: string;
  score: number;
  progress: number;
  repeat: number;
  priority: number;
  private: boolean;
  notes: string;
  hiddenFromStatusLists: boolean;
  customLists: Record<string, boolean>;
  lists?: Record<string, boolean>;
  advancedScores: Record<string, number>;
  startedAt: { year: number | null; month: number | null; day: number | null };
  completedAt: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  updatedAt: number;
  createdAt: number;
  tags?: string[];
  genres?: string[];
  tagCategories?: string[];
  isAdult?: boolean;
  removing?: boolean;
  media: Media;
}

export interface MediaList {
  isCustom: boolean;
  entries: MediaEntry[];
  name: string;
  status: string;
}

// Base response type for all API calls
export interface ApiResponse {
  data: Record<string, unknown>;
  errors?: {
    message: string;
    status?: number;
  }[];
}

export interface MediaListResponse {
  data: {
    MediaListCollection?: {
      lists: MediaList[];
    };
  };
  errors?: {
    message: string;
    status?: number;
  }[];
}

export interface MutationResponse {
  data: {
    SaveMediaListEntry: {
      id: number;
      mediaId: number;
      customLists: Record<string, boolean>;
      hiddenFromStatusLists: boolean;
    };
  };
  errors?: {
    message: string;
    status?: number;
  }[];
}

// Types for Custom List Manager
export interface ListCondition {
  name: string;
  condition: string;
}

export interface CustomList {
  id?: number;
  name: string;
  isCustomList: boolean;
  selectedOption?: string | null;
}

export interface OptionGroup {
  label: string;
  items: { label: string; value: string }[];
}

export interface CustomListApiResponse {
  data: {
    User: {
      mediaListOptions: {
        [key: string]: {
          customLists: string[];
          sectionOrder: string[];
        };
      };
    };
  };
}
