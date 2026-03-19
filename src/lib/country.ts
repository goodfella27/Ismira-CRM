export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "us": "US",
  "u s": "US",
  "u s a": "US",
  "the states": "US",
  "united kingdom": "GB",
  "uk": "GB",
  "u k": "GB",
  "great britain": "GB",
  "england": "GB",
  "scotland": "GB",
  "wales": "GB",
  "ireland": "IE",
  "lithuania": "LT",
  "latvia": "LV",
  "estonia": "EE",
  "poland": "PL",
  "ukraine": "UA",
  "portugal": "PT",
  "spain": "ES",
  "italy": "IT",
  "germany": "DE",
  "france": "FR",
  "netherlands": "NL",
  "belgium": "BE",
  "romania": "RO",
  "bulgaria": "BG",
  "turkey": "TR",
  "russia": "RU",
  "kazakhstan": "KZ",
  "uzbekistan": "UZ",
  "kyrgyzstan": "KG",
  "morocco": "MA",
  "tunisia": "TN",
  "algeria": "DZ",
  "egypt": "EG",
  "philippines": "PH",
  "india": "IN",
  "pakistan": "PK",
  "bangladesh": "BD",
  "sri lanka": "LK",
  "nepal": "NP",
  "brazil": "BR",
  "mexico": "MX",
  "canada": "CA",
  "australia": "AU",
  "sweden": "SE",
  "norway": "NO",
  "finland": "FI",
  "denmark": "DK",
  "austria": "AT",
  "switzerland": "CH",
  "czech republic": "CZ",
  "czechia": "CZ",
  "slovakia": "SK",
  "hungary": "HU",
  "greece": "GR",
  "croatia": "HR",
  "serbia": "RS",
  "georgia": "GE",
  "armenia": "AM",
  "azerbaijan": "AZ",
  "saudi arabia": "SA",
  "united arab emirates": "AE",
  "uae": "AE",
  "u a e": "AE",
  "qatar": "QA",
  "kuwait": "KW",
  "china": "CN",
  "japan": "JP",
  "south korea": "KR",
  "korea": "KR",
  "vietnam": "VN",
  "thailand": "TH",
  "singapore": "SG",
  "malaysia": "MY",
  "indonesia": "ID",
  "israel": "IL",
  "palestine": "PS",
};

const normalizeCountry = (value: string) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const isAlpha2 = (value: string) => /^[a-z]{2}$/i.test(value);

const toFlagEmoji = (code: string) => {
  if (!isAlpha2(code)) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...upper.split("").map((char) => 127397 + char.charCodeAt(0))
  );
};

const COUNTRY_DISPLAY_NAMES =
  typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

export function getCountryCode(country?: string | null): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (!trimmed) return null;
  const normalized = normalizeCountry(trimmed);
  if (isAlpha2(trimmed)) return trimmed.toUpperCase();
  return COUNTRY_NAME_TO_CODE[normalized] ?? null;
}

export function canonicalizeCountry(country?: string | null): string | null {
  if (!country) return null;
  const code = getCountryCode(country);
  if (!code) return null;
  return COUNTRY_DISPLAY_NAMES?.of(code) ?? country.trim();
}

export type CountryDisplay = {
  label: string;
  flag: string;
};

export function getCountryDisplay(country?: string | null): CountryDisplay {
  if (!country) return { label: "—", flag: "" };
  const trimmed = country.trim();
  if (!trimmed) return { label: "—", flag: "" };
  const code = getCountryCode(trimmed) ?? "";
  return {
    label: trimmed,
    flag: code ? toFlagEmoji(code) : "",
  };
}
