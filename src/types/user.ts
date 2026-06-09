export interface UserSettings {
  targetLang: string;
  translationEnabled: boolean;
  theme: "light" | "dark" | "system";
  readingDirection: "ltr" | "rtl";
  wifiOnlyTranslation: boolean;
  overlayFontSize: number;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  targetLang: "en",
  translationEnabled: true,
  theme: "dark",
  readingDirection: "ltr",
  wifiOnlyTranslation: false,
  overlayFontSize: 14,
};

export interface CloudConnection {
  provider: "google_drive" | "terabox";
  status: "connected" | "disconnected" | "expired";
  connectedAt?: string;
  lastSyncAt?: string;
}
