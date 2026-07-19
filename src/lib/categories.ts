/** Canonical category rows (slugs match mobile browse/create catalogs). */
export const CANONICAL_CATEGORIES = [
  { id: "a0000000-0000-4000-8000-000000000001", name: "Clothing", slug: "clothing", icon: "👕" },
  { id: "a0000000-0000-4000-8000-000000000002", name: "Electronics", slug: "electronics", icon: "📱" },
  { id: "a0000000-0000-4000-8000-000000000003", name: "Home & Kitchen", slug: "home_kitchen", icon: "🏠" },
  { id: "a0000000-0000-4000-8000-000000000004", name: "Furniture", slug: "furniture", icon: "🛋️" },
  { id: "a0000000-0000-4000-8000-000000000005", name: "Books", slug: "books", icon: "📚" },
  { id: "a0000000-0000-4000-8000-000000000006", name: "Sneakers", slug: "sneakers", icon: "👟" },
  { id: "a0000000-0000-4000-8000-000000000007", name: "Cameras", slug: "cameras", icon: "📷" },
  { id: "a0000000-0000-4000-8000-000000000008", name: "Sports & Fitness", slug: "sports_fitness", icon: "🏋️" },
  { id: "a0000000-0000-4000-8000-000000000009", name: "Toys & Games", slug: "toys_games", icon: "🎮" },
  { id: "a0000000-0000-4000-8000-00000000000a", name: "Tools", slug: "tools", icon: "🔧" },
  { id: "a0000000-0000-4000-8000-00000000000b", name: "Garden & Outdoor", slug: "garden_outdoor", icon: "🌱" },
  { id: "a0000000-0000-4000-8000-00000000000c", name: "Art & Collectibles", slug: "art_collectibles", icon: "🎨" },
  { id: "a0000000-0000-4000-8000-00000000000d", name: "Instruments", slug: "instruments", icon: "🎸" },
  { id: "a0000000-0000-4000-8000-00000000000e", name: "Baby & Kids", slug: "baby_kids", icon: "🍼" },
  { id: "a0000000-0000-4000-8000-00000000000f", name: "Vehicles & Parts", slug: "vehicles_parts", icon: "🚗" },
  { id: "a0000000-0000-4000-8000-000000000010", name: "Other Toys", slug: "other_toys", icon: "🧩" },
  { id: "a0000000-0000-4000-8000-000000000011", name: "Board Games", slug: "board_games", icon: "♟️" },
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

export function categoryIdBySlug(slug: string): string | undefined {
  return CANONICAL_CATEGORIES.find((c) => c.slug === slug)?.id;
}
