export interface TimezoneOption {
  value: string;
  label: string;
}

export interface TimezoneGroup {
  label: string;
  options: TimezoneOption[];
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    label: "Common",
    options: [
      { value: "America/New_York", label: "America/New_York (EST/EDT)" },
      { value: "America/Chicago", label: "America/Chicago (CST/CDT)" },
      { value: "America/Denver", label: "America/Denver (MST/MDT)" },
      { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
      { value: "UTC", label: "UTC" },
    ],
  },
  {
    label: "Americas",
    options: [
      { value: "America/Anchorage", label: "America/Anchorage" },
      { value: "America/Phoenix", label: "America/Phoenix" },
      { value: "America/Toronto", label: "America/Toronto" },
      { value: "America/Vancouver", label: "America/Vancouver" },
      { value: "America/Mexico_City", label: "America/Mexico_City" },
      { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
      { value: "America/Buenos_Aires", label: "America/Buenos_Aires" },
    ],
  },
  {
    label: "Europe",
    options: [
      { value: "Europe/London", label: "Europe/London" },
      { value: "Europe/Paris", label: "Europe/Paris" },
      { value: "Europe/Berlin", label: "Europe/Berlin" },
      { value: "Europe/Rome", label: "Europe/Rome" },
      { value: "Europe/Madrid", label: "Europe/Madrid" },
      { value: "Europe/Amsterdam", label: "Europe/Amsterdam" },
      { value: "Europe/Moscow", label: "Europe/Moscow" },
    ],
  },
  {
    label: "Asia",
    options: [
      { value: "Asia/Dubai", label: "Asia/Dubai" },
      { value: "Asia/Kolkata", label: "Asia/Kolkata" },
      { value: "Asia/Shanghai", label: "Asia/Shanghai" },
      { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong" },
      { value: "Asia/Tokyo", label: "Asia/Tokyo" },
      { value: "Asia/Seoul", label: "Asia/Seoul" },
      { value: "Asia/Singapore", label: "Asia/Singapore" },
    ],
  },
  {
    label: "Pacific",
    options: [
      { value: "Australia/Sydney", label: "Australia/Sydney" },
      { value: "Australia/Melbourne", label: "Australia/Melbourne" },
      { value: "Pacific/Auckland", label: "Pacific/Auckland" },
    ],
  },
];

/**
 * Get all timezone values as a flat array
 */
export function getAllTimezones(): string[] {
  return TIMEZONE_GROUPS.flatMap((group) =>
    group.options.map((option) => option.value)
  );
}

/**
 * Find a timezone option by value
 */
export function findTimezone(value: string): TimezoneOption | undefined {
  for (const group of TIMEZONE_GROUPS) {
    const option = group.options.find((opt) => opt.value === value);
    if (option) return option;
  }
  return undefined;
}

/**
 * Check if a timezone value is valid
 */
export function isValidTimezone(value: string): boolean {
  return getAllTimezones().includes(value);
}
