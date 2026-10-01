import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export function applicationPhone(number: string, country: CountryCode): string {
  if (!number.trim()) return "";
  const parsed = parsePhoneNumberFromString(number, country);
  if (parsed) return parsed.number;
  const digits = number.replace(/\D/g, "");
  return number.trim().startsWith("+") ? `+${digits}` : `+${getCountryCallingCode(country)}${digits}`;
}
