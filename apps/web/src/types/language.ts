export interface LanguageOption {
  code: string;
  shortCode: string;
  name: string;
  nativeName: string;
  isAiSupported: boolean;
  unsupportedMessage?: string;
}

/**
 * Extensible catalog of interface and AI languages.
 * Member 1's AI service natively supports English (ENG) and Tamil (TAM) on ROCm.
 * Additional languages are included and ready for extended translation/STT models.
 */
export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: "en",
    shortCode: "ENG",
    name: "English",
    nativeName: "English",
    isAiSupported: true,
  },
  {
    code: "ta",
    shortCode: "TAM",
    name: "Tamil",
    nativeName: "தமிழ்",
    isAiSupported: true,
  },
  {
    code: "hi",
    shortCode: "HIN",
    name: "Hindi",
    nativeName: "हिन्दी",
    isAiSupported: false,
    unsupportedMessage: "This language is not currently supported by the AI service.",
  },
  {
    code: "te",
    shortCode: "TEL",
    name: "Telugu",
    nativeName: "తెలుగు",
    isAiSupported: false,
    unsupportedMessage: "This language is not currently supported by the AI service.",
  },
  {
    code: "ml",
    shortCode: "MAL",
    name: "Malayalam",
    nativeName: "മലയാളം",
    isAiSupported: false,
    unsupportedMessage: "This language is not currently supported by the AI service.",
  },
  {
    code: "kn",
    shortCode: "KAN",
    name: "Kannada",
    nativeName: "ಕನ್ನಡ",
    isAiSupported: false,
    unsupportedMessage: "This language is not currently supported by the AI service.",
  },
  {
    code: "bn",
    shortCode: "BEN",
    name: "Bengali",
    nativeName: "বাংলা",
    isAiSupported: false,
    unsupportedMessage: "This language is not currently supported by the AI service.",
  },
  {
    code: "mr",
    shortCode: "MAR",
    name: "Marathi",
    nativeName: "मराठी",
    isAiSupported: false,
    unsupportedMessage: "This language is not currently supported by the AI service.",
  },
];

export function getLanguageOption(code: string): LanguageOption {
  const normalized = (code || "").toLowerCase().trim();
  const match = SUPPORTED_LANGUAGES.find((l) => l.code.toLowerCase() === normalized);
  return match || SUPPORTED_LANGUAGES[0];
}

export function isLanguageAiSupported(code: string): boolean {
  return getLanguageOption(code).isAiSupported;
}
