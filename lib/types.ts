export type ApiErrorKind =
  | "http"
  | "graphql"
  | "network"
  | "timeout"
  | "unknown";

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
  statusCode?: number | null;
  retryable: boolean;
  graphQLErrors?: AniListGraphQLError[];
  metadata?: Record<string, unknown>;
  response?: {
    status: number;
  };
  cause?: unknown;
}

export type AniListRequestVariables = Record<string, unknown>;
export type ApiDataGuard<TData> = (data: unknown) => data is TData;

export const ANILIST_MEDIA_TYPES = ["ANIME", "MANGA"] as const;
export type AniListMediaType = (typeof ANILIST_MEDIA_TYPES)[number];

export const ANILIST_MEDIA_FORMATS = [
  "TV",
  "TV_SHORT",
  "MOVIE",
  "SPECIAL",
  "OVA",
  "ONA",
  "MUSIC",
  "MANGA",
  "NOVEL",
  "ONE_SHOT",
  "MANHWA",
  "MANHUA",
] as const;
export type AniListMediaFormat = (typeof ANILIST_MEDIA_FORMATS)[number];

export const ANILIST_MEDIA_LIST_STATUSES = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "DROPPED",
  "PAUSED",
  "REPEATING",
] as const;
export type AniListMediaListStatus =
  (typeof ANILIST_MEDIA_LIST_STATUSES)[number];

export type AniListListOptionsKey = `${Lowercase<AniListMediaType>}List`;

interface MediaTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
  userPreferred: string | null;
}

interface MediaCoverImage {
  extraLarge: string | null;
  large: string | null;
  medium: string | null;
}

interface MediaTag {
  name: string;
  category: string | null;
}

export interface RateLimitInfo {
  remaining: number | null;
  limit: number | null;
  resetAt: number | null;
}

export interface Media {
  id: number;
  title: MediaTitle;
  coverImage: MediaCoverImage;
  type: AniListMediaType | null;
  format: AniListMediaFormat | null;
  genres: string[] | null;
  isAdult: boolean | null;
  tags: MediaTag[] | null;
  countryOfOrigin: string | null;
}

export interface MediaEntry {
  id: number;
  status: AniListMediaListStatus;
  score: number;
  progress: number;
  repeat: number;
  hiddenFromStatusLists: boolean;
  customLists: Record<string, boolean>;
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
  status: AniListMediaListStatus | null;
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
      mediaListOptions: Partial<
        Record<
          AniListListOptionsKey,
          {
            customLists: string[];
            sectionOrder: string[];
          }
        >
      >;
    } | null;
  };
}

export interface ViewerResponseData {
  Viewer: {
    id: number;
    name: string;
    avatar?: {
      medium?: string | null;
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
    mediaListOptions: Partial<
      Record<
        AniListListOptionsKey,
        {
          customLists: string[];
          sectionOrder: string[];
        }
      >
    > &
      Record<
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

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isNullableBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === "boolean";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isBooleanRecord = (value: unknown): value is Record<string, boolean> =>
  isRecord(value) &&
  Object.values(value).every((item) => typeof item === "boolean");

const isEnumValue = <TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
): value is TValue =>
  typeof value === "string" && allowedValues.includes(value as TValue);

const isNullableEnumValue = <TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
): value is TValue | null =>
  value === null || isEnumValue(value, allowedValues);

const isMediaTitle = (value: unknown): value is MediaTitle => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNullableString(value.romaji) &&
    isNullableString(value.english) &&
    isNullableString(value.native) &&
    isNullableString(value.userPreferred)
  );
};

const isMediaCoverImage = (value: unknown): value is MediaCoverImage => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNullableString(value.extraLarge) &&
    isNullableString(value.large) &&
    isNullableString(value.medium)
  );
};

const isMediaTag = (value: unknown): value is MediaTag => {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.name === "string" && isNullableString(value.category);
};

const isMedia = (value: unknown): value is Media => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.id) &&
    isNullableEnumValue(value.type, ANILIST_MEDIA_TYPES) &&
    isMediaTitle(value.title) &&
    isMediaCoverImage(value.coverImage) &&
    isNullableEnumValue(value.format, ANILIST_MEDIA_FORMATS) &&
    isNullableString(value.countryOfOrigin) &&
    isNullableBoolean(value.isAdult) &&
    (value.genres === null || isStringArray(value.genres)) &&
    (value.tags === null ||
      (Array.isArray(value.tags) && value.tags.every((tag) => isMediaTag(tag))))
  );
};

const isMediaEntry = (value: unknown): value is MediaEntry => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.id) &&
    isEnumValue(value.status, ANILIST_MEDIA_LIST_STATUSES) &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.progress) &&
    isFiniteNumber(value.repeat) &&
    typeof value.hiddenFromStatusLists === "boolean" &&
    isBooleanRecord(value.customLists) &&
    isMedia(value.media)
  );
};

const isMediaList = (value: unknown): value is MediaList => {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return false;
  }

  return (
    typeof value.isCustomList === "boolean" &&
    typeof value.name === "string" &&
    isNullableEnumValue(value.status, ANILIST_MEDIA_LIST_STATUSES) &&
    value.entries.every((entry) => isMediaEntry(entry))
  );
};

const isViewer = (value: unknown): value is ViewerResponseData["Viewer"] => {
  if (!isRecord(value)) {
    return false;
  }

  const avatar = value.avatar;

  return (
    isFiniteNumber(value.id) &&
    typeof value.name === "string" &&
    (avatar === undefined ||
      avatar === null ||
      (isRecord(avatar) && isNullableString(avatar.medium)))
  );
};

export const hasViewerData = (data: unknown): data is ViewerResponseData => {
  if (!isRecord(data)) {
    return false;
  }

  return isViewer(data.Viewer);
};

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

  return mediaListCollection.lists.every((list) => isMediaList(list));
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
