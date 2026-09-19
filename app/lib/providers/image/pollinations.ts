import { ImageProvider } from "./types";

export class PollinationsImageProvider implements ImageProvider {
  async generate(
    prompt: string,
    _sourceImage: Buffer | undefined,
    signal: AbortSignal
  ): Promise<{ url: string }> {
    const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
    url.searchParams.set("width", "1024");
    url.searchParams.set("height", "1024");
    url.searchParams.set("nologo", "true");
    url.searchParams.set("enhance", "true");
    url.searchParams.set("seed", Math.floor(Math.random() * 1_000_000).toString());

    const response = await fetch(url, { method: "GET", signal });
    if (!response.ok) {
      throw new Error(`pollinations_${response.status}`);
    }

    return { url: response.url };
  }
}
