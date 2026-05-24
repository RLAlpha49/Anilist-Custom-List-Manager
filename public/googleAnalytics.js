/* global dataLayer */
globalThis.dataLayer = globalThis.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
globalThis.gtag = globalThis.gtag || gtag;

const TELEMETRY_COOLDOWN_MS = 30000;
const TELEMETRY_MAX_MESSAGE_LENGTH = 160;
const ANILIST_SLOW_REQUEST_THRESHOLD_MS = 3000;
const telemetryCooldownByKey = new Map();

const telemetryContext = {
  environment: document?.body?.dataset?.telemetryEnv || "unknown",
  release: document?.body?.dataset?.telemetryRelease || "unknown",
};

const truncate = (value, limit = TELEMETRY_MAX_MESSAGE_LENGTH) => {
  const normalized = typeof value === "string" ? value : String(value ?? "");
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 1)}…`;
};

const getRoute = () => {
  try {
    return globalThis.location?.pathname || "unknown";
  } catch {
    return "unknown";
  }
};

const shouldEmit = (cooldownKey) => {
  const now = Date.now();
  const previous = telemetryCooldownByKey.get(cooldownKey) || 0;

  if (now - previous < TELEMETRY_COOLDOWN_MS) {
    return false;
  }

  telemetryCooldownByKey.set(cooldownKey, now);
  return true;
};

const emitOperationalEvent = (eventName, params, cooldownKey = eventName) => {
  if (!shouldEmit(cooldownKey)) {
    return;
  }

  if (typeof globalThis.gtag !== "function") {
    return;
  }

  globalThis.gtag("event", eventName, {
    ...telemetryContext,
    route: getRoute(),
    ...params,
  });
};

const toErrorMessage = (reason) => {
  if (reason instanceof Error) {
    return truncate(reason.message);
  }

  if (typeof reason === "string") {
    return truncate(reason);
  }

  try {
    return truncate(JSON.stringify(reason));
  } catch {
    return "unknown";
  }
};

globalThis.addEventListener("error", (event) => {
  const message = event?.error
    ? toErrorMessage(event.error)
    : toErrorMessage(event?.message);

  emitOperationalEvent(
    "aclm_client_error",
    {
      severity: "error",
      message,
      source: truncate(event?.filename || "unknown"),
      line: Number.isFinite(event?.lineno) ? event.lineno : -1,
      column: Number.isFinite(event?.colno) ? event.colno : -1,
    },
    `client_error:${message}`,
  );
});

globalThis.addEventListener("unhandledrejection", (event) => {
  const message = toErrorMessage(event?.reason);

  emitOperationalEvent(
    "aclm_unhandled_rejection",
    {
      severity: "error",
      message,
    },
    `unhandled_rejection:${message}`,
  );
});

if (typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (...args) => {
    const startedAt = performance.now();
    const request = args[0];
    const resource = typeof request === "string" ? request : request?.url || "";

    try {
      const response = await originalFetch(...args);
      const durationMs = Math.round(performance.now() - startedAt);
      const isAniListRequest = resource.includes("graphql.anilist.co");

      if (isAniListRequest && durationMs >= ANILIST_SLOW_REQUEST_THRESHOLD_MS) {
        emitOperationalEvent(
          "aclm_anilist_request_slow",
          {
            severity: "warn",
            duration_ms: durationMs,
            threshold_ms: ANILIST_SLOW_REQUEST_THRESHOLD_MS,
            status: response.status,
          },
          `anilist_slow:${response.status}:${Math.floor(durationMs / 1000)}`,
        );
      }

      if (isAniListRequest && !response.ok) {
        emitOperationalEvent(
          "aclm_anilist_request_failure",
          {
            severity: "error",
            status: response.status,
            status_text: truncate(response.statusText || "unknown"),
            duration_ms: durationMs,
          },
          `anilist_failure:${response.status}`,
        );
      }

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      const isAniListRequest = resource.includes("graphql.anilist.co");

      if (isAniListRequest) {
        const message = toErrorMessage(error);

        emitOperationalEvent(
          "aclm_anilist_request_failure",
          {
            severity: "error",
            status: 0,
            status_text: "network_or_timeout",
            duration_ms: durationMs,
            message,
          },
          `anilist_failure:network:${message}`,
        );
      }

      throw error;
    }
  };
}

gtag("js", new Date());

gtag("config", "G-6L7RKZ1C2L");
