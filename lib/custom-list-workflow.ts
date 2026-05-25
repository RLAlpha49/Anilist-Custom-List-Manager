import {
  type AniListMediaType,
  type AniListRequestVariables,
  type ApiResponse,
  type CustomListRule,
  type CustomListRuleConfig,
  type CustomListRulePolarity,
  type CustomListRuleSet,
  hasPagedMediaListCollectionData,
  type MediaEntry,
  type MediaListPaginationMetadata,
  type MediaListResponse,
} from "@/lib/types";

export interface WorkflowMediaListQueryVariables extends AniListRequestVariables {
  userId: number;
  type: AniListMediaType;
  chunk: number;
  perChunk: number;
}

export const WORKFLOW_MEDIA_LIST_PAGE_SIZE = 500;

export const WORKFLOW_MEDIA_LIST_QUERY = `
  query ($userId: Int, $type: MediaType, $chunk: Int, $perChunk: Int) {
    MediaListCollection(
      userId: $userId
      type: $type
      chunk: $chunk
      perChunk: $perChunk
    ) {
      hasNextChunk
      lists {
        name
        status
        isCustomList
        entries {
          id
          status
          score
          progress
          repeat
          hiddenFromStatusLists
          customLists
          media {
            id
            type
            title { romaji english native userPreferred }
            coverImage { extraLarge large medium }
            format
            countryOfOrigin
            isAdult
            genres
            tags { name category }
          }
        }
      }
    }
  }
`;

const STATUS_REGEX = /^Status set to (.+)$/;
const SCORE_REGEX = /^Score set to (\d+)$/;
const GENRE_REGEX = /^Genres contain (.+)$/;
const TAG_REGEX = /^Tags contain (.+)$/;
const TAG_CATEGORY_REGEX = /^Tag Categories contain (.+)$/;
const FORMAT_REGEX = /^Format set to (.+)$/;

const STATUS_MAP: Record<string, string> = {
  Watching: "CURRENT",
  Reading: "CURRENT",
  Completed: "COMPLETED",
  Paused: "PAUSED",
  Planning: "PLANNING",
  Dropped: "DROPPED",
  Repeating: "REPEATING",
};

const FORMAT_MAP: Record<string, string> = {
  TV: "TV",
  TV_Short: "TV_SHORT",
  Movie: "MOVIE",
  Special: "SPECIAL",
  OVA: "OVA",
  ONA: "ONA",
  Music: "MUSIC",
  "Manga (Japan)": "MANGA",
  "Manga (South Korean)": "MANHWA",
  "Manga (Chinese)": "MANHUA",
  "One shot": "ONE_SHOT",
  Novel: "NOVEL",
};

const MANGA_REGION_COUNTRY_MAP: Record<string, string> = {
  "Manga (South Korean)": "KR",
  "Manga (Chinese)": "CN",
};

const hashString = (value: string): string => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.trunc((hash << 5) - hash + (value.codePointAt(index) ?? 0));
  }

  return Math.abs(hash).toString(36);
};

const slugify = (value: string): string => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "").slice(0, 40) || "rule";
};

export const createRuleId = (seed?: string): string => {
  if (seed) {
    return `rule-${slugify(seed)}-${hashString(seed)}`;
  }

  const randomPart =
    typeof globalThis !== "undefined" &&
    globalThis.crypto !== undefined &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `rule-${randomPart}`;
};

export const createEmptyRule = (
  polarity: CustomListRulePolarity = "include",
): CustomListRule => ({
  id: createRuleId(),
  condition: "",
  polarity,
});

export const createEmptyRuleSet = (): CustomListRuleSet => ({
  operator: "ALL",
  rules: [],
});

const normalizeRule = (
  rule: Partial<CustomListRule> | null | undefined,
  index: number,
  seedPrefix: string,
): CustomListRule => ({
  id:
    typeof rule?.id === "string" && rule.id.trim().length > 0
      ? rule.id
      : createRuleId(`${seedPrefix}-${index}-${rule?.condition ?? "empty"}`),
  condition: typeof rule?.condition === "string" ? rule.condition : "",
  polarity: rule?.polarity === "exclude" ? "exclude" : "include",
});

export const normalizeRuleSet = (
  ruleSet?: CustomListRuleSet | null,
  legacySelectedOption?: string | null,
): CustomListRuleSet => {
  if (ruleSet && Array.isArray(ruleSet.rules)) {
    return {
      operator: ruleSet.operator === "ANY" ? "ANY" : "ALL",
      rules: ruleSet.rules.map((rule, index) =>
        normalizeRule(rule, index, `${ruleSet.operator ?? "ALL"}`),
      ),
    };
  }

  const legacyCondition = legacySelectedOption?.trim();
  if (legacyCondition) {
    return {
      operator: "ALL",
      rules: [
        {
          id: createRuleId(`legacy-${legacyCondition}`),
          condition: legacyCondition,
          polarity: "include",
        },
      ],
    };
  }

  return createEmptyRuleSet();
};

export const getActiveRules = (
  ruleSet?: CustomListRuleSet | null,
  legacySelectedOption?: string | null,
): CustomListRule[] =>
  normalizeRuleSet(ruleSet, legacySelectedOption).rules.filter(
    (rule) => rule.condition.trim().length > 0,
  );

export const hasActiveIncludeRules = (
  ruleSet?: CustomListRuleSet | null,
  legacySelectedOption?: string | null,
): boolean =>
  getActiveRules(ruleSet, legacySelectedOption).some(
    (rule) => rule.polarity === "include",
  );

export const getLegacySelectedOption = (
  ruleSet?: CustomListRuleSet | null,
  legacySelectedOption?: string | null,
): string => {
  const activeRules = getActiveRules(ruleSet, legacySelectedOption);
  const includeRules = activeRules.filter(
    (rule) => rule.polarity === "include",
  );
  const excludeRules = activeRules.filter(
    (rule) => rule.polarity === "exclude",
  );
  const normalizedRuleSet = normalizeRuleSet(ruleSet, legacySelectedOption);

  if (
    normalizedRuleSet.operator === "ALL" &&
    includeRules.length === 1 &&
    excludeRules.length === 0
  ) {
    return includeRules[0].condition;
  }

  return typeof legacySelectedOption === "string" ? legacySelectedOption : "";
};

export const normalizeCustomListRuleConfig = <T extends CustomListRuleConfig>(
  config: T,
): T & { ruleSet: CustomListRuleSet; selectedOption: string } => ({
  ...config,
  ruleSet: normalizeRuleSet(config.ruleSet, config.selectedOption),
  selectedOption: getLegacySelectedOption(
    config.ruleSet,
    config.selectedOption,
  ),
});

export const summarizeRuleSet = (
  ruleSet?: CustomListRuleSet | null,
  legacySelectedOption?: string | null,
): string => {
  const activeRules = getActiveRules(ruleSet, legacySelectedOption);
  if (activeRules.length === 0) {
    return "No rules configured";
  }

  const includeCount = activeRules.filter(
    (rule) => rule.polarity === "include",
  ).length;
  const excludeCount = activeRules.length - includeCount;
  const normalizedRuleSet = normalizeRuleSet(ruleSet, legacySelectedOption);
  const joiner = normalizedRuleSet.operator === "ALL" ? "all" : "any";
  const summary: string[] = [
    `Match ${joiner} of ${includeCount} include rule${includeCount === 1 ? "" : "s"}`,
  ];

  if (excludeCount > 0) {
    summary.push(
      `block ${excludeCount} exclude rule${excludeCount === 1 ? "" : "s"}`,
    );
  }

  return summary.join(" • ");
};

const matchesMangaRegion = (label: string, entry: MediaEntry): boolean => {
  if (entry.media.format !== "MANGA" && entry.media.format !== "ONE_SHOT") {
    return false;
  }

  const countryOfOrigin = entry.media.countryOfOrigin?.toUpperCase() ?? null;
  const expectedCountry = MANGA_REGION_COUNTRY_MAP[label];

  if (expectedCountry) {
    return countryOfOrigin === expectedCountry;
  }

  if (label === "Manga (Japan)") {
    return countryOfOrigin !== "KR" && countryOfOrigin !== "CN";
  }

  return false;
};

export const matchCondition = (
  condition: string,
  entry: MediaEntry,
): boolean => {
  const statusMatch = STATUS_REGEX.exec(condition);
  if (statusMatch) {
    return (
      entry.status ===
      (STATUS_MAP[statusMatch[1]] ?? statusMatch[1].toUpperCase())
    );
  }

  if (condition === "Score set to below 5") {
    return entry.score > 0 && entry.score < 5;
  }

  const scoreMatch = SCORE_REGEX.exec(condition);
  if (scoreMatch) {
    return entry.score === Number.parseInt(scoreMatch[1], 10);
  }

  const genreMatch = GENRE_REGEX.exec(condition);
  if (genreMatch) {
    return (entry.genres ?? []).includes(genreMatch[1]);
  }

  const tagMatch = TAG_REGEX.exec(condition);
  if (tagMatch) {
    return (entry.tags ?? []).includes(tagMatch[1]);
  }

  const tagCategoryMatch = TAG_CATEGORY_REGEX.exec(condition);
  if (tagCategoryMatch) {
    return (entry.tagCategories ?? []).includes(tagCategoryMatch[1]);
  }

  const formatMatch = FORMAT_REGEX.exec(condition);
  if (formatMatch) {
    if (formatMatch[1].startsWith("Manga (")) {
      return matchesMangaRegion(formatMatch[1], entry);
    }

    return (
      entry.media.format === (FORMAT_MAP[formatMatch[1]] ?? formatMatch[1])
    );
  }

  if (condition === "Rewatched" || condition === "Reread") {
    return (entry.repeat ?? 0) > 0;
  }

  if (condition === "Adult (18+)") {
    return !!(entry.isAdult ?? entry.media.isAdult);
  }

  return false;
};

export const evaluateRuleSet = (
  ruleSet?: CustomListRuleSet | null,
  entry?: MediaEntry,
  legacySelectedOption?: string | null,
): boolean => {
  if (!entry) {
    return false;
  }

  const activeRules = getActiveRules(ruleSet, legacySelectedOption);
  const includeRules = activeRules.filter(
    (rule) => rule.polarity === "include",
  );
  if (includeRules.length === 0) {
    return false;
  }

  const normalizedRuleSet = normalizeRuleSet(ruleSet, legacySelectedOption);
  const includeMatches =
    normalizedRuleSet.operator === "ALL"
      ? includeRules.every((rule) => matchCondition(rule.condition, entry))
      : includeRules.some((rule) => matchCondition(rule.condition, entry));

  if (!includeMatches) {
    return false;
  }

  return !activeRules
    .filter((rule) => rule.polarity === "exclude")
    .some((rule) => matchCondition(rule.condition, entry));
};

export const getCurrentCustomLists = (entry: MediaEntry): string[] =>
  Object.entries(entry.customLists)
    .filter(([, value]) => value)
    .map(([name]) => name);

export const hydrateMediaEntry = (entry: MediaEntry): MediaEntry => {
  const mediaTags = entry.media.tags ?? [];

  return {
    ...entry,
    genres: entry.media.genres ?? [],
    tags: mediaTags.map((tag) => tag.name),
    tagCategories: [
      ...new Set(
        mediaTags
          .map((tag) => tag.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ],
    isAdult: entry.media.isAdult ?? false,
  };
};

export const getMediaEntryTitle = (entry: MediaEntry): string =>
  entry.media.title.userPreferred ||
  entry.media.title.romaji ||
  entry.media.title.english ||
  "Unknown";

export const computeEntryWorkflowUpdate = (
  entry: MediaEntry,
  listConfigs: CustomListRuleConfig[],
  listsToRemove: string[],
  hideFromStatus: boolean,
): { newLists: string[]; changed: boolean; shouldHide: boolean } => {
  const currentLists = new Set<string>(getCurrentCustomLists(entry));
  const newLists = new Set<string>(currentLists);

  for (const rawConfig of listConfigs) {
    const config = normalizeCustomListRuleConfig(rawConfig);
    if (!hasActiveIncludeRules(config.ruleSet, config.selectedOption)) {
      continue;
    }

    if (evaluateRuleSet(config.ruleSet, entry, config.selectedOption)) {
      newLists.add(config.name);
    } else {
      newLists.delete(config.name);
    }
  }

  for (const name of listsToRemove) {
    newLists.delete(name);
  }

  const shouldHide = hideFromStatus && newLists.size > 0;
  const hideChanged = shouldHide !== entry.hiddenFromStatusLists;
  const nextLists = [...newLists];
  const changed =
    currentLists.size !== newLists.size ||
    nextLists.some((name) => !currentLists.has(name)) ||
    [...currentLists].some((name) => !newLists.has(name)) ||
    hideChanged;

  return {
    newLists: nextLists,
    changed,
    shouldHide,
  };
};

export const estimateMatchesForListConfig = (
  entries: MediaEntry[],
  listConfig: CustomListRuleConfig,
  sampleSize = 3,
): { totalMatches: number; sampleTitles: string[] } => {
  const config = normalizeCustomListRuleConfig(listConfig);
  if (!hasActiveIncludeRules(config.ruleSet, config.selectedOption)) {
    return { totalMatches: 0, sampleTitles: [] };
  }

  const sampleTitles: string[] = [];
  let totalMatches = 0;

  for (const entry of entries) {
    if (!evaluateRuleSet(config.ruleSet, entry, config.selectedOption)) {
      continue;
    }

    totalMatches += 1;

    if (sampleTitles.length < sampleSize) {
      sampleTitles.push(getMediaEntryTitle(entry));
    }
  }

  return { totalMatches, sampleTitles };
};

const appendUniqueEntries = (
  entryMap: Map<number, MediaEntry>,
  response: MediaListResponse["data"],
): MediaListPaginationMetadata => {
  if (!hasPagedMediaListCollectionData(response)) {
    throw new Error("AniList returned an unexpected media list payload.");
  }

  const { lists, hasNextChunk } = response.MediaListCollection;

  for (const list of lists) {
    for (const entry of list.entries) {
      if (!entryMap.has(entry.id)) {
        entryMap.set(entry.id, hydrateMediaEntry(entry));
      }
    }
  }

  return {
    chunk: 0,
    perChunk: 0,
    hasNextChunk,
  };
};

export const fetchAllWorkflowMediaEntries = async ({
  userId,
  type,
  fetchPage,
  onRateLimit,
  shouldCancel,
}: {
  userId: number;
  type: AniListMediaType;
  fetchPage: (
    variables: WorkflowMediaListQueryVariables,
  ) => Promise<ApiResponse<MediaListResponse["data"]>>;
  onRateLimit?: (
    remaining: ApiResponse<MediaListResponse["data"]>["rateLimit"] | null,
  ) => void;
  shouldCancel?: () => boolean;
}): Promise<MediaEntry[]> => {
  const entryMap = new Map<number, MediaEntry>();
  let pagination: MediaListPaginationMetadata = {
    chunk: 1,
    perChunk: WORKFLOW_MEDIA_LIST_PAGE_SIZE,
    hasNextChunk: true,
  };

  do {
    const response = await fetchPage({
      userId,
      type,
      chunk: pagination.chunk,
      perChunk: pagination.perChunk,
    });

    onRateLimit?.(response.rateLimit ?? null);

    if (shouldCancel?.()) {
      return [...entryMap.values()];
    }

    if (response.data.MediaListCollection == null) {
      break;
    }

    const { hasNextChunk } = appendUniqueEntries(entryMap, response.data);

    pagination = {
      ...pagination,
      chunk: pagination.chunk + 1,
      hasNextChunk,
    };
  } while (pagination.hasNextChunk);

  return [...entryMap.values()];
};
