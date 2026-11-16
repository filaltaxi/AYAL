import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ayal — skills from your neighbours",
    short_name: "Ayal",
    description: "Find and offer everyday skills within your own locality.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f3",
    theme_color: "#1f6f5c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
