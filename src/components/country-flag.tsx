import flagCodes from "@/lib/country-flag-codes.json";

const supportedCodes = new Set<string>(flagCodes);

/** Local SVGs keep country flags independent of OS emoji fonts. */
export function CountryFlag({ code }: { code: string }) {
  const normalized = code.trim().toLowerCase();
  if (!supportedCodes.has(normalized)) return null;
  return (
    // Static SVGs are already small and do not need image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${normalized}.svg`}
      alt=""
      aria-hidden="true"
      width={18}
      height={13.5}
      className="inline-block h-[13.5px] w-[18px] shrink-0 rounded-[2px] object-contain align-middle"
    />
  );
}
