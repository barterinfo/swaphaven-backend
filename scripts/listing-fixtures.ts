import crypto from "node:crypto";

export type ListingFixture = {
  title: string;
  description: string;
  category: string;
  categoryId: string;
  condition: "new" | "like_new" | "great" | "good" | "fair";
  estimatedValue: number;
  acceptCashTopUps: boolean;
  isSwipeOnly: boolean;
  wantedCategoryIds: string[];
  wantedCategories: string[];
  wantedFreeText: string;
  details: { ageRange: string; brand: string };
  location: {
    lat: number;
    lng: number;
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  imageSeed: string;
};

const CONDITIONS = ["new", "like_new", "great", "good", "fair"] as const;

const AGE_RANGES = [
  "Less than 1 year",
  "1-2 years",
  "2-3 years",
  "3-5 years",
  "5-10 years",
  "10+ years",
];

const WANTED_SNIPPETS = [
  "Open to similar value trades",
  "Prefer local pickup swaps",
  "Happy to discuss cash top-up",
  "Looking for comparable gear",
  "Trade for something I can use daily",
  "Interested in bundles or sets",
];

type CategoryRef = { id: string; label: string };

const CATEGORIES: CategoryRef[] = [
  { id: "cameras", label: "Cameras" },
  { id: "electronics", label: "Electronics" },
  { id: "home_kitchen", label: "Home & Kitchen" },
  { id: "furniture", label: "Furniture" },
  { id: "books", label: "Books" },
  { id: "sneakers", label: "Sneakers" },
  { id: "tools", label: "Tools" },
  { id: "toys_games", label: "Gaming" },
  { id: "clothing", label: "Clothing" },
  { id: "instruments", label: "Instruments" },
  { id: "sports_fitness", label: "Sports" },
  { id: "garden_outdoor", label: "Garden" },
  { id: "art_collectibles", label: "Art & Collectibles" },
  { id: "board_games", label: "Board Games" },
];

type City = {
  city: string;
  state: string;
  postalCode: string;
  lat: number;
  lng: number;
};

const CITIES: City[] = [
  { city: "San Francisco", state: "CA", postalCode: "94103", lat: 37.7749, lng: -122.4194 },
  { city: "Oakland", state: "CA", postalCode: "94607", lat: 37.8044, lng: -122.2712 },
  { city: "San Jose", state: "CA", postalCode: "95113", lat: 37.3382, lng: -121.8863 },
  { city: "Berkeley", state: "CA", postalCode: "94704", lat: 37.8715, lng: -122.273 },
  { city: "Palo Alto", state: "CA", postalCode: "94301", lat: 37.4419, lng: -122.143 },
  { city: "Fremont", state: "CA", postalCode: "94538", lat: 37.5485, lng: -121.9886 },
  { city: "Concord", state: "CA", postalCode: "94520", lat: 37.9577, lng: -122.0348 },
  { city: "Daly City", state: "CA", postalCode: "94015", lat: 37.6879, lng: -122.4702 },
];

type ProductTemplate = {
  categoryId: string;
  brands: string[];
  models: string[];
  variants: string[];
  notes: string[];
  valueRange: [number, number];
};

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    categoryId: "cameras",
    brands: ["Canon", "Sony", "Nikon", "Fujifilm", "Panasonic"],
    models: ["Mirrorless Body", "DSLR Kit", "Compact Travel Camera", "Action Cam Bundle"],
    variants: ["with 24-70mm lens", "low shutter count", "includes 2 batteries", "creator bundle"],
    notes: ["Sensor is clean", "Screen has no scratches", "Comes with original box", "Used for weekend shoots only"],
    valueRange: [350, 2200],
  },
  {
    categoryId: "electronics",
    brands: ["Apple", "Samsung", "Google", "Sony", "Bose"],
    models: ["Tablet", "Noise-Canceling Headphones", "Smart Speaker", "Portable Monitor"],
    variants: ["128GB", "256GB", "Wi-Fi model", "with case"],
    notes: ["Battery health excellent", "Factory reset ready", "Includes charger and cable", "No cracks or dents"],
    valueRange: [80, 950],
  },
  {
    categoryId: "home_kitchen",
    brands: ["KitchenAid", "Breville", "Instant Pot", "Le Creuset", "Ninja"],
    models: ["Stand Mixer", "Espresso Machine", "Air Fryer", "Dutch Oven"],
    variants: ["5-quart", "stainless steel", "matte black", "barely used"],
    notes: ["Deep cleaned before listing", "All accessories included", "Works perfectly", "Smoke-free home"],
    valueRange: [60, 420],
  },
  {
    categoryId: "furniture",
    brands: ["West Elm", "Article", "IKEA", "CB2", "Vintage"],
    models: ["Accent Chair", "Coffee Table", "Bookshelf", "Desk"],
    variants: ["walnut finish", "mid-century style", "compact size", "pickup only"],
    notes: ["Minor wear on corners", "Sturdy and stable", "Pet-free home", "Disassembled for easier transport"],
    valueRange: [90, 650],
  },
  {
    categoryId: "books",
    brands: ["Penguin", "Scholastic", "O'Reilly", "Vintage Press", "Independent"],
    models: ["Hardcover Set", "Graphic Novel Collection", "Programming Books", "Cookbook Lot"],
    variants: ["complete series", "first editions mix", "like-new pages", "annotated lightly"],
    notes: ["No missing volumes", "Stored on bookshelf", "Great reader copies", "Bundle discount friendly"],
    valueRange: [25, 180],
  },
  {
    categoryId: "sneakers",
    brands: ["Nike", "Adidas", "New Balance", "ASICS", "Converse"],
    models: ["Running Shoes", "Basketball High-Tops", "Daily Trainers", "Limited Colorway"],
    variants: ["size 9", "size 10", "size 11", "women's 8"],
    notes: ["Worn indoors only", "Original box included", "Soles have plenty of life", "Freshly cleaned"],
    valueRange: [55, 280],
  },
  {
    categoryId: "tools",
    brands: ["DeWalt", "Milwaukee", "Makita", "Ryobi", "Craftsman"],
    models: ["Drill/Driver Kit", "Circular Saw", "Tool Box Set", "Impact Driver"],
    variants: ["20V platform", "with 2 batteries", "contractor grade", "home DIY kit"],
    notes: ["Tested before listing", "Bits and blades included", "Normal cosmetic wear", "Ready for projects"],
    valueRange: [45, 320],
  },
  {
    categoryId: "toys_games",
    brands: ["Nintendo", "Sony", "Microsoft", "Valve", "Retro"],
    models: ["Handheld Console", "Controller Bundle", "VR Headset", "Retro Console"],
    variants: ["with carrying case", "includes 3 games", "OLED model", "digital-ready"],
    notes: ["No stick drift", "Adult-owned setup", "Updated to latest firmware", "All cables included"],
    valueRange: [120, 520],
  },
  {
    categoryId: "clothing",
    brands: ["Patagonia", "Arc'teryx", "Carhartt", "Levi's", "Uniqlo"],
    models: ["Insulated Jacket", "Hiking Shell", "Denim Jacket", "Merino Sweater"],
    variants: ["men's M", "men's L", "women's S", "unisex fit"],
    notes: ["Freshly laundered", "No rips or stains", "Great layering piece", "Stored folded in closet"],
    valueRange: [35, 220],
  },
  {
    categoryId: "instruments",
    brands: ["Fender", "Yamaha", "Gibson", "Roland", "Kala"],
    models: ["Electric Guitar", "Digital Piano", "Ukulele", "Audio Interface"],
    variants: ["with gig bag", "recently set up", "home studio ready", "beginner friendly"],
    notes: ["Plays cleanly up the neck", "Includes stand or case", "Smoke-free studio", "Ready to jam"],
    valueRange: [90, 780],
  },
  {
    categoryId: "sports_fitness",
    brands: ["Peloton", "Bowflex", "Thule", "Specialized", "Garmin"],
    models: ["Bike Trainer", "Adjustable Dumbbells", "Roof Rack", "GPS Watch"],
    variants: ["compact footprint", "barely used", "includes mount", "latest generation"],
    notes: ["Works as expected", "Great for home workouts", "Minimal wear", "Pickup preferred"],
    valueRange: [70, 600],
  },
  {
    categoryId: "garden_outdoor",
    brands: ["Weber", "Yeti", "Coleman", "Greenworks", "Traeger"],
    models: ["Gas Grill", "Cooler", "Camp Chair Set", "Electric Mower"],
    variants: ["3-burner", "with cover", "family size", "recently serviced"],
    notes: ["Cleaned after each use", "Stored in garage", "Ready for season", "No rust issues"],
    valueRange: [80, 550],
  },
  {
    categoryId: "art_collectibles",
    brands: ["Local Artist", "Funko", "LEGO", "Gallery Print", "Handmade"],
    models: ["Screen Print", "Collectible Figure", "Display Set", "Signed Poster"],
    variants: ["limited run", "signed piece", "display-ready", "mint condition"],
    notes: ["Stored away from sunlight", "Great display piece", "Perfect gift candidate", "Unique one-of-one vibe"],
    valueRange: [30, 260],
  },
  {
    categoryId: "board_games",
    brands: ["Hasbro", "Days of Wonder", "Fantasy Flight", "CMON", "Independent"],
    models: ["Strategy Game", "Party Game Bundle", "Co-op Adventure", "Family Game Night Set"],
    variants: ["complete components", "expansion included", "like-new box", "played twice"],
    notes: ["All pieces accounted for", "Box corners lightly worn", "Great for groups", "Smoke-free game shelf"],
    valueRange: [20, 120],
  },
];

export const MAX_LISTING_FIXTURES = PRODUCT_TEMPLATES.length;

function categoryById(id: string): CategoryRef {
  return CATEGORIES.find((c) => c.id === id) ?? { id: "electronics", label: "Electronics" };
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function jitterCoord(value: number, rng: () => number): number {
  return Number((value + (rng() - 0.5) * 0.08).toFixed(4));
}

function serialCode(rng: () => number): string {
  return randomInt(100000, 999999, rng).toString();
}

function pickWantedCategories(
  excludeId: string,
  rng: () => number,
): { ids: string[]; labels: string[] } {
  const pool = CATEGORIES.filter((c) => c.id !== excludeId);
  const shuffled = shuffle(pool, rng);
  const picked = shuffled.slice(0, 2);
  return {
    ids: picked.map((c) => c.id),
    labels: picked.map((c) => c.label),
  };
}

function buildFixture(template: ProductTemplate, index: number, rng: () => number): ListingFixture {
  const category = categoryById(template.categoryId);
  const brand = pick(template.brands, rng);
  const model = pick(template.models, rng);
  const variant = pick(template.variants, rng);
  const note = pick(template.notes, rng);
  const condition = pick(CONDITIONS, rng);
  const ageRange = pick(AGE_RANGES, rng);
  const city = pick(CITIES, rng);
  const serial = serialCode(rng);
  const streetNo = randomInt(100, 9999, rng);
  const wanted = pickWantedCategories(template.categoryId, rng);
  const estimatedValue = randomInt(template.valueRange[0], template.valueRange[1], rng);
  const acceptCashTopUps = rng() > 0.35;
  const isSwipeOnly = rng() > 0.4;
  const runNonce = crypto.randomBytes(4).toString("hex");

  const title = `${brand} ${model} (${variant})`;
  const description =
    `${note}. ${pick(WANTED_SNIPPETS, rng)} Listed ${new Date().toISOString().slice(0, 10)}. Ref ${serial}.`;

  return {
    title,
    description,
    category: category.label,
    categoryId: category.id,
    condition,
    estimatedValue,
    acceptCashTopUps,
    isSwipeOnly,
    wantedCategoryIds: wanted.ids,
    wantedCategories: wanted.labels,
    wantedFreeText: `${pick(WANTED_SNIPPETS, rng)} Serial ${serial}.`,
    details: { ageRange, brand },
    location: {
      lat: jitterCoord(city.lat, rng),
      lng: jitterCoord(city.lng, rng),
      address: `${streetNo} ${pick(["Market", "Broadway", "Mission", "University", "El Camino"], rng)} St`,
      city: city.city,
      state: city.state,
      country: "US",
      postalCode: city.postalCode,
    },
    imageSeed: `seed-${runNonce}-${index}-${template.categoryId}`,
  };
}

/** Builds fresh listing fixtures on every call (unique titles, copy, values, and locations). */
export function generateListingFixtures(count: number): ListingFixture[] {
  const safeCount = Math.max(1, Math.min(count, PRODUCT_TEMPLATES.length));
  const seed = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  let state = 0;
  const rng = () => {
    state += 1;
    const hash = crypto.createHash("sha256").update(`${seed}:${state}`).digest();
    return hash.readUInt32BE(0) / 0xffffffff;
  };

  const templates = shuffle(PRODUCT_TEMPLATES, rng).slice(0, safeCount);
  return templates.map((template, index) => buildFixture(template, index, rng));
}
