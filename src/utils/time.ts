/**
 * Time utility module for GigaMind CLI
 * Provides timezone-aware time formatting and relative time calculations
 */

/**
 * Current time information object
 */
export interface CurrentTimeInfo {
  /** ISO string in UTC */
  utc: string;
  /** Formatted local time string (user-friendly) */
  local: string;
  /** User's timezone name (e.g., "Asia/Seoul", "America/New_York") */
  timezone: string;
  /** UTC offset string (e.g., "+09:00", "-05:00") */
  offset: string;
}

/**
 * Timezone information object
 */
export interface TimezoneInfo {
  /** User's timezone name (e.g., "Asia/Seoul", "America/New_York") */
  timezone: string;
  /** UTC offset string (e.g., "+09:00", "-05:00") */
  offset: string;
}

/**
 * Gets the user's timezone name using Intl API
 * @returns The IANA timezone identifier (e.g., "Asia/Seoul")
 */
function getTimezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Calculates the UTC offset string for a given date
 * @param date - The date to calculate offset for
 * @returns UTC offset string (e.g., "+09:00", "-05:00")
 */
function getUtcOffsetString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absOffset / 60);
  const minutes = absOffset % 60;

  return `${sign}${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Formats a date to a user-friendly local time string
 * @param date - Date object or ISO string to format
 * @returns Formatted local time string (e.g., "2024년 12월 20일 금요일 오후 3:30:45")
 */
export function formatLocalTime(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return formatter.format(dateObj);
}

/**
 * Gets the current time information including UTC, local time, timezone, and offset
 * @returns Current time information object
 */
export function getCurrentTime(): CurrentTimeInfo {
  const now = new Date();

  return {
    utc: now.toISOString(),
    local: formatLocalTime(now),
    timezone: getTimezoneName(),
    offset: getUtcOffsetString(now),
  };
}

/**
 * Gets timezone information for the user's current timezone
 * @returns Timezone name and UTC offset
 */
export function getTimezoneInfo(): TimezoneInfo {
  const now = new Date();

  return {
    timezone: getTimezoneName(),
    offset: getUtcOffsetString(now),
  };
}

/**
 * Formats a date as relative time in Korean
 * @param date - Date object or ISO string to format
 * @returns Relative time string in Korean (e.g., "방금 전", "5분 전", "2시간 전")
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();

  // Handle future dates
  if (diffMs < 0) {
    return formatFutureRelativeTime(-diffMs);
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 10) {
    return "방금 전";
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}초 전`;
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }

  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  if (diffDays === 1) {
    return "어제";
  }

  if (diffDays < 7) {
    return `${diffDays}일 전`;
  }

  if (diffWeeks < 4) {
    return `${diffWeeks}주 전`;
  }

  if (diffMonths < 12) {
    return `${diffMonths}개월 전`;
  }

  return `${diffYears}년 전`;
}

/**
 * Formats future relative time in Korean
 * @param diffMs - Time difference in milliseconds (positive value)
 * @returns Relative future time string in Korean
 */
function formatFutureRelativeTime(diffMs: number): string {
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 10) {
    return "곧";
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}초 후`;
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 후`;
  }

  if (diffHours < 24) {
    return `${diffHours}시간 후`;
  }

  if (diffDays === 1) {
    return "내일";
  }

  if (diffDays < 7) {
    return `${diffDays}일 후`;
  }

  if (diffWeeks < 4) {
    return `${diffWeeks}주 후`;
  }

  if (diffMonths < 12) {
    return `${diffMonths}개월 후`;
  }

  return `${diffYears}년 후`;
}

/**
 * Formats CurrentTimeInfo into a concise display string
 * @param timeInfo - Current time information object
 * @returns Formatted string like "2024-12-20 오후 3:45 (Asia/Seoul, UTC+09:00)"
 */
export function formatTimeDisplay(timeInfo: CurrentTimeInfo): string {
  const now = new Date(timeInfo.utc);

  // Format date as YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Format time in Korean locale (오전/오후 format)
  const timeStr = now.toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${dateStr} ${timeStr} (${timeInfo.timezone}, UTC${timeInfo.offset})`;
}
