/**
 * Province and topic for the /articles index filters (owner, Oct 30 2026).
 *
 * Pure. Frontmatter `province:` / `topic:` win when an article sets them (use the
 * keys below, e.g. `province: "ab"`, `topic: "profile-report"`); otherwise both
 * are read from the slug, then the title. The slug is the better signal: most
 * titles say "Canada" even when the page is about one province.
 */

export const PROVINCES = [
  { key: "canada", label: "Canada-wide" },
  { key: "federal", label: "Federal" },
  { key: "ab", label: "Alberta" },
  { key: "bc", label: "British Columbia" },
  { key: "mb", label: "Manitoba" },
  { key: "nb", label: "New Brunswick" },
  { key: "nl", label: "Newfoundland & Labrador" },
  { key: "ns", label: "Nova Scotia" },
  { key: "nt", label: "Northwest Territories" },
  { key: "nu", label: "Nunavut" },
  { key: "on", label: "Ontario" },
  { key: "pe", label: "Prince Edward Island" },
  { key: "qc", label: "Quebec" },
  { key: "sk", label: "Saskatchewan" },
  { key: "yt", label: "Yukon" },
] as const;
export type ProvinceKey = (typeof PROVINCES)[number]["key"];

export const TOPICS = [
  { key: "annual-return", label: "Annual Returns" },
  { key: "incorporation", label: "Incorporation" },
  { key: "profile-report", label: "Profile Reports" },
  { key: "good-standing", label: "Certificates & Documents" },
  { key: "registry-search", label: "Registry Search & Access" },
  { key: "minute-book", label: "Minute Books & Resolutions" },
  { key: "changes", label: "Changes & Dissolution" },
  { key: "tax-banking", label: "Tax, Year-End & Banking" },
  { key: "other", label: "Other" },
] as const;
export type TopicKey = (typeof TOPICS)[number]["key"];

/* Order matters: the first rule that matches wins. */
const PROVINCE_RULES: [ProvinceKey, RegExp][] = [
  ["federal", /\bfederal(ly)?\b|corporations canada/],
  ["nt", /northwest[- ]territories|\bnwt\b/],
  ["nu", /\bnunavut\b/],
  ["yt", /\byukon\b/],
  ["nl", /newfoundland|labrador/],
  ["pe", /prince[- ]edward|\bpei\b/],
  ["ns", /nova[- ]scotia|\brjsc\b|joint[- ]stock/],
  ["nb", /new[- ]brunswick/],
  ["qc", /\bquebec\b|\bquébec\b/],
  ["on", /\bontario\b|\bobr\b/],
  ["mb", /\bmanitoba\b/],
  ["sk", /\bsaskatchewan\b/],
  ["bc", /british[- ]columbia|\bbc\b|\bb\.c\.|bceid/],
  ["ab", /\balberta\b|\bcores\b/],
];

const TOPIC_RULES: [TopicKey, RegExp][] = [
  ["profile-report", /profile[- ]report|company[- ]summary|quickbooks|corporate[- ]search[- ]for/],
  ["tax-banking", /tax[- ]return|year[- ]end|bank[- ]account|\bt2\b|dividend/],
  ["annual-return", /annual[- ](return|report)/],
  ["changes", /dissolv|dissolution|change[- ](directors|address|registered)|revival|revive|amalgamat/],
  ["minute-book", /minute[- ]book|by-?laws|resolution|share[- ]certificate|transparency|significant[- ]control|\bisc\b|securities[- ]register/],
  ["good-standing", /good[- ]standing|certificate[- ]of[- ]status|corporate[- ]documents|copy[- ]of/],
  ["incorporation", /incorporat|register[- ]a[- ]business|extra[- ]provincial|continuance/],
  ["registry-search", /search|registry|cores|bceid|password|name[- ]search|nuans|\brjsc\b/],
];

const PROVINCE_KEYS = new Set<string>(PROVINCES.map((p) => p.key));
const TOPIC_KEYS = new Set<string>(TOPICS.map((t) => t.key));

function norm(s: string): string {
  return s.toLowerCase().replace(/[_]+/g, "-");
}

export function articleProvince(slug: string, title: string, override?: unknown): ProvinceKey {
  if (typeof override === "string" && PROVINCE_KEYS.has(override.toLowerCase())) return override.toLowerCase() as ProvinceKey;
  for (const text of [norm(slug), norm(title)]) {
    for (const [key, re] of PROVINCE_RULES) if (re.test(text)) return key;
  }
  return "canada";
}

export function articleTopic(slug: string, title: string, override?: unknown): TopicKey {
  if (typeof override === "string" && TOPIC_KEYS.has(override.toLowerCase())) return override.toLowerCase() as TopicKey;
  for (const text of [norm(slug), norm(title)]) {
    for (const [key, re] of TOPIC_RULES) if (re.test(text)) return key;
  }
  return "other";
}

export const provinceLabel = (k: ProvinceKey) => PROVINCES.find((p) => p.key === k)?.label ?? k;
export const topicLabel = (k: TopicKey) => TOPICS.find((t) => t.key === k)?.label ?? k;
