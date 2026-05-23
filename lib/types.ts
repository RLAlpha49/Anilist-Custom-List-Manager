export type ApiErrorKind = "http" | "graphql" | "network" | "unknown";

export interface AniListGraphQLError {
  message: string;
  path?: Array<string | number>;
  locations?: Array<{
    line: number;
    column: number;
  }>;
  extensions?: Record<string, unknown>;
  status?: number;
}

export interface ApiError extends Error {
  kind: ApiErrorKind;
  message: string;
  messages: string[];
  status: number | null;
  retryable: boolean;
  graphQLErrors?: AniListGraphQLError[];
  response?: {
    status: number;
  };
  cause?: unknown;
}

export type AniListRequestVariables = Record<string, unknown>;

export interface RateLimitInfo {
  remaining: number | null;
  limit: number | null;
  resetAt: number | null;
}

interface Media {
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

interface MediaList {
  isCustomList: boolean;
  entries: MediaEntry[];
  name: string;
  status: string;
}

interface MediaListCollection {
  lists: MediaList[];
  hasNextChunk?: boolean;
}

// Base response type for all AniList API calls.
export interface ApiResponse<TData> {
  data: TData;
  errors?: AniListGraphQLError[];
  rateLimit?: RateLimitInfo;
}

export interface MediaListResponse {
  data: {
    MediaListCollection?: MediaListCollection | null;
  };
  errors?: AniListGraphQLError[];
}

export interface MediaListPaginationMetadata {
  chunk: number;
  perChunk: number;
  hasNextChunk: boolean;
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
  errors?: AniListGraphQLError[];
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
    User?: {
      mediaListOptions: {
        [key: string]: {
          customLists: string[];
          sectionOrder: string[];
        };
      };
    } | null;
  };
}

export type NarrowMediaListCollectionData = {
  MediaListCollection: NonNullable<
    MediaListResponse["data"]["MediaListCollection"]
  >;
};

export type NarrowPagedMediaListCollectionData = {
  MediaListCollection: NarrowMediaListCollectionData["MediaListCollection"] & {
    hasNextChunk: boolean;
  };
};

export type NarrowCustomListOptionsData = {
  User: {
    mediaListOptions: Record<
      string,
      {
        customLists: string[];
        sectionOrder: string[];
      }
    >;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const hasMediaListCollectionData = (
  data: unknown,
): data is NarrowMediaListCollectionData => {
  if (!isRecord(data)) {
    return false;
  }

  const mediaListCollection = data.MediaListCollection;
  if (
    !isRecord(mediaListCollection) ||
    !Array.isArray(mediaListCollection.lists)
  ) {
    return false;
  }

  return true;
};

export const hasPagedMediaListCollectionData = (
  data: unknown,
): data is NarrowPagedMediaListCollectionData => {
  if (!hasMediaListCollectionData(data)) {
    return false;
  }

  return typeof data.MediaListCollection.hasNextChunk === "boolean";
};

export const hasCustomListOptionsData = (
  data: unknown,
  listKey: string,
): data is NarrowCustomListOptionsData => {
  if (!isRecord(data)) {
    return false;
  }

  const user = data.User;
  if (!isRecord(user)) {
    return false;
  }

  const mediaListOptions = user.mediaListOptions;
  if (!isRecord(mediaListOptions)) {
    return false;
  }

  const listOptions = mediaListOptions[listKey];
  if (!isRecord(listOptions)) {
    return false;
  }

  return (
    isStringArray(listOptions.customLists) &&
    isStringArray(listOptions.sectionOrder)
  );
};
