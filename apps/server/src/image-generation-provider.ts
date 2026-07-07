import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MatterhornImageFormat,
  MatterhornImageGenerationInput,
  MatterhornImageGenerationResponse,
  MatterhornImageGenerationStatus,
  MatterhornImageProvider,
  MatterhornImageQuality,
  MatterhornImageSize,
} from "@matterhorn-work/types/generated-media";

export interface ImageGenerationProviderConfig {
  provider: MatterhornImageProvider;
  apiKey?: string;
  model?: string;
  defaultSize?: MatterhornImageSize;
  defaultQuality?: MatterhornImageQuality;
  defaultFormat?: MatterhornImageFormat;
}

export interface ImageGenerationProviderStatus {
  status: MatterhornImageGenerationStatus;
  label: string;
  provider: MatterhornImageProvider;
  model: string;
  size: string;
  quality: string;
  format: MatterhornImageFormat;
  message?: string;
}

export interface ImageGenerationProvider {
  status(): Promise<ImageGenerationProviderStatus>;
  generate(input: ImageGenerationProviderInput): Promise<MatterhornImageGenerationResponse>;
}

interface ImageGenerationProviderInput extends MatterhornImageGenerationInput {
  workspaceId: string;
  storageDir: string;
}

const SECRET_PATTERNS = [
  /\b(sk-[a-zA-Z0-9]{20,})\b/,
  /\b-----BEGIN (RSA |EC |OPENSSH |PGP )?(PRIVATE KEY|SECRET KEY)-----/,
  /\b0x[a-fA-F0-9]{64}\b/,
  /\bmnemonic\b[^\n]{0,200}\b(?:abandon|ability|able|about|above|absent|absorb|abstract|absurd)\b/i,
  /\bseed phrase\b/i,
  /\bprivate key\b/i,
];

export function detectSecretShapedInput(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizePrompt(prompt: string): { prompt: string; redacted: boolean; secretsRejected: boolean } {
  if (detectSecretShapedInput(prompt)) {
    return {
      prompt: "[redacted: secret-shaped input detected]",
      redacted: true,
      secretsRejected: true,
    };
  }
  return { prompt, redacted: false, secretsRejected: false };
}

function formatMimeType(format: MatterhornImageFormat): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "png":
    default:
      return "image/png";
  }
}

function fileExtension(format: MatterhornImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

function imageSizeDimensions(size: MatterhornImageSize): { width: number; height: number } {
  switch (size) {
    case "1024x1024":
      return { width: 1024, height: 1024 };
    case "1536x1024":
      return { width: 1536, height: 1024 };
    case "1024x1536":
      return { width: 1024, height: 1536 };
    case "auto":
    default:
      return { width: 1024, height: 1024 };
  }
}

function buildMockPng(width: number, height: number): Buffer {
  // Minimal valid PNG: IHDR + IDAT + IEND.
  // The IDAT contains a single uncompressed scanline of opaque gray pixels.
  const { deflateSync } = require("node:zlib");
  const scanline = Buffer.alloc(1 + width * 3, 0x80);
  scanline[0] = 0x00; // filter byte
  const idat = deflateSync(scanline);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = require("node:crypto").createHash("md5").update(typeBuf).update(data).digest().readUInt32BE(0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

async function writeGeneratedImageFile(
  storageDir: string,
  imageId: string,
  format: MatterhornImageFormat,
  bytes: Buffer,
): Promise<{ relativePath: string; fileName: string; sha256: string; byteLength: number }> {
  const ext = fileExtension(format);
  const fileName = `${imageId}.${ext}`;
  const relativePath = `.matterhorn-work/outputs/images/${fileName}`;
  const dir = join(storageDir, ".matterhorn-work", "outputs", "images");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, fileName);
  await writeFile(filePath, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { relativePath, fileName, sha256, byteLength: bytes.length };
}

async function mockGenerate(input: ImageGenerationProviderInput): Promise<MatterhornImageGenerationResponse> {
  const sanitized = sanitizePrompt(input.prompt);
  if (sanitized.secretsRejected) {
    return {
      success: false,
      code: "image_prompt_secret_rejected",
      message: "The prompt was rejected because it contained secret-shaped input.",
      details: { redacted: true },
    };
  }

  const format = input.format ?? "png";
  const size = input.size ?? "1024x1024";
  const quality = input.quality ?? "auto";
  const model = input.model ?? "mock-image-1";
  const dims = imageSizeDimensions(size);
  const bytes = buildMockPng(dims.width, dims.height);
  const imageId = `img_${randomUUID().replace(/-/g, "")}`;
  const outputId = `out_${randomUUID().replace(/-/g, "")}`;

  const fileInfo = await writeGeneratedImageFile(input.storageDir, imageId, format, bytes);

  return {
    success: true,
    image: {
      id: imageId,
      workspaceId: input.workspaceId,
      outputId,
      provider: "mock",
      model,
      prompt: sanitized.prompt,
      size,
      quality,
      format,
      fileName: fileInfo.fileName,
      relativePath: fileInfo.relativePath,
      contentType: formatMimeType(format),
      byteLength: fileInfo.byteLength,
      sha256: fileInfo.sha256,
      createdAt: new Date().toISOString(),
      status: "generated",
      safety: {
        secretsRejected: false,
      },
    },
  };
}

async function openaiGenerate(input: ImageGenerationProviderInput, apiKey?: string): Promise<MatterhornImageGenerationResponse> {
  if (!apiKey?.trim()) {
    return {
      success: false,
      code: "image_provider_needs_setup",
      message: "OpenAI image generation requires an OPENAI_API_KEY.",
    };
  }

  const sanitized = sanitizePrompt(input.prompt);
  if (sanitized.secretsRejected) {
    return {
      success: false,
      code: "image_prompt_secret_rejected",
      message: "The prompt was rejected because it contained secret-shaped input.",
      details: { redacted: true },
    };
  }

  const format = input.format ?? "png";
  const size = input.size ?? "1024x1024";
  const quality = input.quality ?? "auto";
  const model = input.model ?? "gpt-image-1";

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: sanitized.prompt,
        n: 1,
        size,
        quality,
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        success: false,
        code: "image_provider_error",
        message: typeof body.error?.message === "string" ? body.error.message : `OpenAI returned ${response.status}.`,
      };
    }

    const json = await response.json();
    const b64 = json.data?.[0]?.b64_json;
    if (typeof b64 !== "string") {
      return {
        success: false,
        code: "image_provider_invalid_response",
        message: "OpenAI did not return image data.",
      };
    }

    const bytes = Buffer.from(b64, "base64");
    const revisedPrompt = json.data?.[0]?.revised_prompt;
    const imageId = `img_${randomUUID().replace(/-/g, "")}`;
    const outputId = `out_${randomUUID().replace(/-/g, "")}`;
    const fileInfo = await writeGeneratedImageFile(input.storageDir, imageId, format, bytes);

    return {
      success: true,
      image: {
        id: imageId,
        workspaceId: input.workspaceId,
        outputId,
        provider: "openai",
        model,
        prompt: sanitized.prompt,
        promptRevised: typeof revisedPrompt === "string" ? revisedPrompt : undefined,
        size,
        quality,
        format,
        fileName: fileInfo.fileName,
        relativePath: fileInfo.relativePath,
        contentType: formatMimeType(format),
        byteLength: fileInfo.byteLength,
        sha256: fileInfo.sha256,
        createdAt: new Date().toISOString(),
        status: "generated",
        safety: {
          secretsRejected: false,
        },
      },
    };
  } catch (err) {
    return {
      success: false,
      code: "image_provider_unreachable",
      message: err instanceof Error ? err.message : "Could not reach the image provider.",
    };
  }
}

export function createImageGenerationProvider(config: ImageGenerationProviderConfig): ImageGenerationProvider {
  const effectiveModel = config.model ?? (config.provider === "openai" ? "gpt-image-1" : "mock-image-1");
  const effectiveSize = config.defaultSize ?? "1024x1024";
  const effectiveQuality = config.defaultQuality ?? "auto";
  const effectiveFormat = config.defaultFormat ?? "png";

  return {
    async status(): Promise<ImageGenerationProviderStatus> {
      if (config.provider === "mock") {
        return {
          status: "working",
          label: "Mock image provider",
          provider: "mock",
          model: effectiveModel,
          size: effectiveSize,
          quality: effectiveQuality,
          format: effectiveFormat,
        };
      }
      if (!config.apiKey?.trim()) {
        return {
          status: "needs_setup",
          label: "OpenAI image provider",
          provider: "openai",
          model: effectiveModel,
          size: effectiveSize,
          quality: effectiveQuality,
          format: effectiveFormat,
          message: "Set OPENAI_API_KEY to enable OpenAI image generation.",
        };
      }
      return {
        status: "working",
        label: "OpenAI image provider",
        provider: "openai",
        model: effectiveModel,
        size: effectiveSize,
        quality: effectiveQuality,
        format: effectiveFormat,
      };
    },
    async generate(input: ImageGenerationProviderInput): Promise<MatterhornImageGenerationResponse> {
      if (config.provider === "mock") {
        return mockGenerate(input);
      }
      return openaiGenerate(input, config.apiKey);
    },
  };
}

export function resolveImageGenerationProviderFromEnv(env: typeof process.env): ImageGenerationProviderConfig {
  const provider = env.MATTERHORN_IMAGE_PROVIDER?.trim() as MatterhornImageProvider | undefined;
  if (provider === "openai" || (provider === undefined && env.OPENAI_API_KEY?.trim())) {
    return {
      provider: "openai",
      apiKey: env.OPENAI_API_KEY,
      model: env.MATTERHORN_IMAGE_MODEL?.trim() || "gpt-image-1",
      defaultSize: (env.MATTERHORN_IMAGE_SIZE?.trim() as MatterhornImageSize) || "1024x1024",
      defaultQuality: (env.MATTERHORN_IMAGE_QUALITY?.trim() as MatterhornImageQuality) || "auto",
      defaultFormat: (env.MATTERHORN_IMAGE_FORMAT?.trim() as MatterhornImageFormat) || "png",
    };
  }
  return {
    provider: "mock",
    apiKey: env.OPENAI_API_KEY,
    model: env.MATTERHORN_IMAGE_MODEL?.trim() || "mock-image-1",
    defaultSize: (env.MATTERHORN_IMAGE_SIZE?.trim() as MatterhornImageSize) || "1024x1024",
    defaultQuality: (env.MATTERHORN_IMAGE_QUALITY?.trim() as MatterhornImageQuality) || "auto",
    defaultFormat: (env.MATTERHORN_IMAGE_FORMAT?.trim() as MatterhornImageFormat) || "png",
  };
}
