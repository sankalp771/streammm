import { ImageProvider } from "./types";

// MockImageProvider: 8-second simulated delay demo safety net (Decision D-09)
export class MockImageProvider implements ImageProvider {
  async generate(
    _prompt: string,
    _sourceImage: Buffer | undefined,
    signal: AbortSignal
  ): Promise<{ url: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({
          url: "/mock-poster.svg",
        });
      }, 8000);

      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Image generation aborted"));
      });
    });
  }
}
