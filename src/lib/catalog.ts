// Static reference data: localities, categories and starter-kit templates.

export interface Locality {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  blurb: string;
  beachhead: boolean;
}

export const LOCALITIES: Locality[] = [
  { slug: "hsr-layout", name: "HSR Layout", lat: 12.9116, lng: 77.6474, beachhead: true,
    blurb: "Startup alley: PGs, co-living blocks and a steady churn of job-switchers." },
  { slug: "koramangala", name: "Koramangala", lat: 12.9352, lng: 77.6245, beachhead: true,
    blurb: "Dense renter blocks and co-living buildings, minutes from the startup offices." },
  { slug: "bellandur", name: "Bellandur", lat: 12.926, lng: 77.6762, beachhead: true,
    blurb: "Outer Ring Road tech parks with thousands of flat-shares nearby." },
  { slug: "marathahalli", name: "Marathahalli", lat: 12.9569, lng: 77.7011, beachhead: true,
    blurb: "Affordable PGs and shared flats for engineers across ORR." },
  { slug: "whitefield", name: "Whitefield", lat: 12.9698, lng: 77.75, beachhead: true,
    blurb: "ITPL and EPIP campuses; interns, trainees and transferred employees." },
  { slug: "btm-layout", name: "BTM Layout", lat: 12.9166, lng: 77.6101, beachhead: false,
    blurb: "Student and fresher PG hub close to Koramangala." },
  { slug: "indiranagar", name: "Indiranagar", lat: 12.9784, lng: 77.6408, beachhead: false,
    blurb: "Premium flats, expats and returning NRIs." },
  { slug: "electronic-city", name: "Electronic City", lat: 12.8452, lng: 77.6602, beachhead: false,
    blurb: "Hosur Road campuses and large intern cohorts." },
  { slug: "banashankari", name: "Banashankari", lat: 12.9255, lng: 77.5468, beachhead: false,
    blurb: "College cluster in South Bengaluru, busy every April–June." },
  { slug: "rr-nagar", name: "RR Nagar", lat: 12.9274, lng: 77.5155, beachhead: false,
    blurb: "Mysore Road campuses and hostels." },
];

export function locality(slug: string): Locality | undefined {
  return LOCALITIES.find((l) => l.slug === slug);
}

export function localityName(slug: string): string {
  return locality(slug)?.name ?? slug;
}

export type CategoryGroup = "furniture" | "appliance" | "electronics" | "kitchen" | "other";

export interface Category {
  id: string;
  label: string;
  group: CategoryGroup;
  icon: string;
  heavy: boolean; // needs a mini-truck
  typicalNewPrice: number; // ₹, mid-range new price
  annualDepreciation: number; // fraction of value lost per year
  ewaste: boolean;
  buyBackEligible: boolean; // category has reliable resale data
}

export const CATEGORIES: Category[] = [
  { id: "bed", label: "Bed frame", group: "furniture", icon: "🛏️", heavy: true, typicalNewPrice: 12000, annualDepreciation: 0.15, ewaste: false, buyBackEligible: true },
  { id: "mattress", label: "Mattress", group: "furniture", icon: "🛌", heavy: true, typicalNewPrice: 8000, annualDepreciation: 0.25, ewaste: false, buyBackEligible: true },
  { id: "study_table", label: "Study table", group: "furniture", icon: "🪑", heavy: false, typicalNewPrice: 4500, annualDepreciation: 0.15, ewaste: false, buyBackEligible: true },
  { id: "chair", label: "Chair", group: "furniture", icon: "💺", heavy: false, typicalNewPrice: 2500, annualDepreciation: 0.18, ewaste: false, buyBackEligible: false },
  { id: "office_chair", label: "Office chair", group: "furniture", icon: "🪑", heavy: false, typicalNewPrice: 8000, annualDepreciation: 0.18, ewaste: false, buyBackEligible: true },
  { id: "sofa", label: "Sofa", group: "furniture", icon: "🛋️", heavy: true, typicalNewPrice: 20000, annualDepreciation: 0.2, ewaste: false, buyBackEligible: true },
  { id: "wardrobe", label: "Wardrobe", group: "furniture", icon: "🚪", heavy: true, typicalNewPrice: 9000, annualDepreciation: 0.15, ewaste: false, buyBackEligible: false },
  { id: "shelf", label: "Bookshelf / rack", group: "furniture", icon: "📚", heavy: false, typicalNewPrice: 2500, annualDepreciation: 0.2, ewaste: false, buyBackEligible: false },
  { id: "fridge", label: "Refrigerator", group: "appliance", icon: "🧊", heavy: true, typicalNewPrice: 18000, annualDepreciation: 0.12, ewaste: true, buyBackEligible: true },
  { id: "washing_machine", label: "Washing machine", group: "appliance", icon: "🫧", heavy: true, typicalNewPrice: 20000, annualDepreciation: 0.12, ewaste: true, buyBackEligible: true },
  { id: "cooler", label: "Air cooler", group: "appliance", icon: "🌬️", heavy: false, typicalNewPrice: 7000, annualDepreciation: 0.15, ewaste: true, buyBackEligible: false },
  { id: "fan", label: "Fan", group: "appliance", icon: "🌀", heavy: false, typicalNewPrice: 2500, annualDepreciation: 0.15, ewaste: true, buyBackEligible: false },
  { id: "induction", label: "Induction stove", group: "kitchen", icon: "🍳", heavy: false, typicalNewPrice: 2500, annualDepreciation: 0.2, ewaste: true, buyBackEligible: false },
  { id: "microwave", label: "Microwave", group: "kitchen", icon: "📦", heavy: false, typicalNewPrice: 7500, annualDepreciation: 0.15, ewaste: true, buyBackEligible: false },
  { id: "kitchen_set", label: "Kitchen set", group: "kitchen", icon: "🥘", heavy: false, typicalNewPrice: 2500, annualDepreciation: 0.3, ewaste: false, buyBackEligible: false },
  { id: "bucket_set", label: "Bucket & bath basics", group: "other", icon: "🪣", heavy: false, typicalNewPrice: 700, annualDepreciation: 0.4, ewaste: false, buyBackEligible: false },
  { id: "tv", label: "Television", group: "electronics", icon: "📺", heavy: false, typicalNewPrice: 22000, annualDepreciation: 0.2, ewaste: true, buyBackEligible: false },
  { id: "monitor", label: "Monitor", group: "electronics", icon: "🖥️", heavy: false, typicalNewPrice: 11000, annualDepreciation: 0.2, ewaste: true, buyBackEligible: false },
  { id: "cycle", label: "Bicycle", group: "other", icon: "🚲", heavy: false, typicalNewPrice: 9000, annualDepreciation: 0.15, ewaste: false, buyBackEligible: false },
  { id: "books", label: "Books", group: "other", icon: "📖", heavy: false, typicalNewPrice: 1500, annualDepreciation: 0.3, ewaste: false, buyBackEligible: false },
  { id: "lamp", label: "Lamp / lighting", group: "other", icon: "💡", heavy: false, typicalNewPrice: 1200, annualDepreciation: 0.2, ewaste: true, buyBackEligible: false },
  { id: "decor", label: "Curtains & decor", group: "other", icon: "🪴", heavy: false, typicalNewPrice: 1500, annualDepreciation: 0.3, ewaste: false, buyBackEligible: false },
  { id: "other", label: "Other", group: "other", icon: "📦", heavy: false, typicalNewPrice: 2000, annualDepreciation: 0.25, ewaste: false, buyBackEligible: false },
];

export function category(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const CONDITIONS = [
  { id: "like_new", label: "Like new", factor: 1.0 },
  { id: "good", label: "Good", factor: 0.85 },
  { id: "fair", label: "Fair", factor: 0.65 },
  { id: "worn", label: "Well used", factor: 0.45 },
] as const;

export function conditionLabel(id: string): string {
  return CONDITIONS.find((c) => c.id === id)?.label ?? id;
}

export interface KitTemplate {
  slug: string;
  name: string;
  audience: string;
  slots: { label: string; categories: string[] }[];
}

export const KITS: KitTemplate[] = [
  {
    slug: "new-joiner-room",
    name: "New-joiner room kit",
    audience: "First job in a shared flat",
    slots: [
      { label: "Bed", categories: ["bed"] },
      { label: "Mattress", categories: ["mattress"] },
      { label: "Table", categories: ["study_table"] },
      { label: "Chair", categories: ["office_chair", "chair"] },
      { label: "Fan", categories: ["fan", "cooler"] },
    ],
  },
  {
    slug: "fresher-pg",
    name: "Fresher PG kit",
    audience: "Students moving into a PG or hostel",
    slots: [
      { label: "Mattress", categories: ["mattress"] },
      { label: "Study table", categories: ["study_table"] },
      { label: "Chair", categories: ["chair", "office_chair"] },
      { label: "Cooling", categories: ["cooler", "fan"] },
      { label: "Bath basics", categories: ["bucket_set"] },
    ],
  },
  {
    slug: "intern",
    name: "Intern kit",
    audience: "Two to twelve months in the city",
    slots: [
      { label: "Mattress", categories: ["mattress"] },
      { label: "Chair", categories: ["chair", "office_chair"] },
      { label: "Induction stove", categories: ["induction"] },
      { label: "Kitchen set", categories: ["kitchen_set"] },
      { label: "Bath basics", categories: ["bucket_set"] },
    ],
  },
  {
    slug: "first-flat",
    name: "First flat kit",
    audience: "Setting up a whole flat",
    slots: [
      { label: "Fridge", categories: ["fridge"] },
      { label: "Washing machine", categories: ["washing_machine"] },
      { label: "Sofa", categories: ["sofa"] },
      { label: "Bed", categories: ["bed"] },
      { label: "Mattress", categories: ["mattress"] },
    ],
  },
];

// Banned-items list from the trust & safety policy.
export const BANNED_KEYWORDS = [
  "gun", "pistol", "rifle", "ammunition", "weapon",
  "medicine", "prescription", "drugs", "ganja", "alcohol", "liquor",
  "counterfeit", "replica", "first copy", "gas cylinder", "lpg",
];
