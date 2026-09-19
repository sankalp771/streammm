// Interface for pluggable image generation providers (Decision D-09)
export interface ImageProvider {
  generate(
    prompt: string,
    sourceImage: Buffer | undefined,
    signal: AbortSignal
  ): Promise<{ url: string }>;
}