/**
 * Infer a display timezone from a US NANP-style phone string (area code / NPA).
 * Heuristic: overlays, split states, and toll-free numbers may not match local clocks.
 */

const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888", "822"]);

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** 3-digit US area code for +1XXXXXXXXXX or 10-digit national format. */
export function extractUsNanpAreaCode(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const d = digitsOnly(phone);
  if (d.length === 11 && d.startsWith("1")) return d.slice(1, 4);
  if (d.length === 10) return d.slice(0, 3);
  return null;
}

function parseCodes(codes: string): string[] {
  return codes
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter((c) => c.length === 3 && /^\d{3}$/.test(c));
}

/** Later layers overwrite earlier ones (fixes East/West splits). */
function mergeTimezoneLayers(layers: { iana: string; codes: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const { iana, codes } of layers) {
    for (const c of parseCodes(codes)) {
      m.set(c, iana);
    }
  }
  return m;
}

const AREA_TO_IANA = mergeTimezoneLayers([
  {
    iana: "America/New_York",
    codes: `
      201 202 203 207 212 215 216 217 220 223 227 228 229 232 234 235 239 240 248 252 260 262 267 269
      272 276 283 301 302 304 305 315 321 324 326 329 330 331 334 336 339 347 351 352 360 386 401 404
      407 410 412 413 419 423 434 440 443 445 447 448 458 463 464 468 470 475 478 479 484 500 501 502
      503 504 506 507 508 509 513 515 516 517 518 520 530 531 534 539 540 541 551 557 559 561 562 563
      564 567 570 571 573 574 575 580 585 586 603 606 607 608 609 610 612 614 615 616 617 618 619 620
      623 626 628 629 630 631 636 640 641 646 650 651 656 657 659 660 661 662 667 669 678 680 681 689
      701 702 703 704 706 708 712 713 715 716 717 718 724 725 726 730 731 732 734 740 743 747 754 757
      758 762 763 765 769 770 772 774 775 779 781 786 802 803 804 810 812 814 828 835 838 839 840 843
      845 848 856 857 858 859 860 862 863 864 865 870 872 878 901 903 904 906 908 910 912 914 917 918 919
      929 934 937 939 947 948 954 959 973 978 980 984 985 989
    `,
  },
  {
    iana: "America/Chicago",
    codes: `
      205 210 214 218 219 224 251 254 256 309 312 314 316 318 319 325 331 334 346 361 364 402 405 409
      417 430 432 447 464 469 501 504 507 512 515 563 573 574 575 580 601 605 608 618 620 630 636 641
      660 662 680 682 701 708 712 713 715 726 730 731 763 769 773 779 806 815 816 817 830 832 847 850
      218 320 507 612 651 763 870 901 903 906 918 920 931 936 940 945 952 956 959 972 979 985
    `,
  },
  {
    iana: "America/Denver",
    codes: `
      303 307 308 385 406 435 505 575 719 720 725 785 915 970 983
    `,
  },
  {
    iana: "America/Phoenix",
    codes: `480 520 602 623 928`,
  },
  {
    iana: "America/Los_Angeles",
    codes: `
      209 213 279 310 323 341 369 408 415 424 442 510 530 559 562 619 628 650 657 661 669 702 707 714
      725 747 760 805 818 820 831 840 858 909 916 925 949 951 971 986
      206 253 360 425 509 564
      458 541 503 971
    `,
  },
  {
    iana: "America/Anchorage",
    codes: `907`,
  },
  {
    iana: "Pacific/Honolulu",
    codes: `808`,
  },
  {
    iana: "America/Puerto_Rico",
    codes: `787 939`,
  },
]);

export type PhoneTimezoneHint = {
  areaCode: string;
  iana: string;
  generic: string;
  short: string;
  localTime: string;
  approximate: boolean;
};

function tzParts(iana: string, at: Date): { generic: string; short: string; localTime: string } {
  const generic =
    new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "longGeneric" }).formatToParts(at);
  const shortParts = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "short" }).formatToParts(
    at,
  );
  const genericName = generic.find((p) => p.type === "timeZoneName")?.value ?? iana;
  const shortName = shortParts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const localTime = new Intl.DateTimeFormat("en-US", {
    timeZone: iana,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
  return { generic: genericName, short: shortName, localTime };
}

export function timezoneHintFromPhone(phone: string | null | undefined, at = new Date()): PhoneTimezoneHint | null {
  const area = extractUsNanpAreaCode(phone);
  if (!area || TOLL_FREE.has(area)) return null;
  const iana = AREA_TO_IANA.get(area);
  if (!iana) return null;
  const { generic, short, localTime } = tzParts(iana, at);
  return {
    areaCode: area,
    iana,
    generic,
    short,
    localTime,
    approximate: true,
  };
}
