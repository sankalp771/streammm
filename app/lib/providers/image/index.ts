import { MockImageProvider } from "./mock";
import { PollinationsImageProvider } from "./pollinations";
import type { ImageProvider } from "./types";

export function getImageProvider(): { name: string; provider: ImageProvider } {
  const name = process.env.IMAGE_PROVIDER || "mock";

  if (name === "pollinations") {
    return { name, provider: new PollinationsImageProvider() };
  }

  return { name: "mock", provider: new MockImageProvider() };
}
