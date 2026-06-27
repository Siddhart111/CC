// Curated abstract avatar set (3D playful style)
export const AVATARS = [
  "https://images.unsplash.com/photo-1728577740843-5f29c7586afe?w=400&q=80&auto=format",
  "https://images.unsplash.com/photo-1740252117027-4275d3f84385?w=400&q=80&auto=format",
  "https://images.unsplash.com/photo-1740252117070-7aa2955b25f8?w=400&q=80&auto=format",
  "https://images.unsplash.com/photo-1622547748225-3fc4abd2cca0?w=400&q=80&auto=format",
];

export function pickRandomAvatar(exclude?: string | null): string {
  let choice = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  if (exclude && AVATARS.length > 1) {
    let tries = 0;
    while (choice === exclude && tries < 5) {
      choice = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      tries++;
    }
  }
  return choice;
}

// Initials fallback color from string
export function colorForName(name: string): string {
  const palette = ["#FF6B6B", "#FFC13B", "#4ECDC4", "#1A1A1A", "#A06CD5"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
