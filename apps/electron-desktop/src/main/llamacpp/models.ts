import * as path from "node:path";

export type LlamacppModelId =
  | "qwen-3.6-35b"
  | "qwen-3.5-4b"
  | "qwen-3.5-9b"
  | "qwen-3.5-35b"
  | "glm-4.7-flash-30b"
  | "nemotron-3-nano-4b"
  | "nemotron-3-nano-30b"
  | "gemma-4-e4b"
  | "gemma-4-26b-a4b"
  | "gemma-4-31b";

export interface LlamacppModelDef {
  id: LlamacppModelId;
  name: string;
  filename: string;
  huggingFaceUrl: string;
  fileSizeGb: number;
  sizeLabel: string;
  description: string;
  /** Architectural maximum context the model supports */
  maxContextLength: number;
  contextLabel: string;
  minRamGb: number;
  recommendedRamGb: number;
  /** Icon key used by the renderer to pick the right SVG asset */
  icon: string;
  /** Bundled chat-template asset filename (relative to assets/ai-models/) for --chat-template-file */
  chatTemplateAsset?: string;
  /** Static display tag shown in the UI (e.g. "Recommended", "High Performance") */
  tag?: string;
}

export const LLAMACPP_MODELS: LlamacppModelDef[] = [
  {
    id: "gemma-4-e4b",
    name: "Gemma 4 E4B GGUF",
    filename: "gemma-4-E4B-it-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf",
    fileSizeGb: 4.98,
    sizeLabel: "5 GB",
    description: "Compact multimodal reasoning",
    maxContextLength: 131_072,
    contextLabel: "128K",
    minRamGb: 8,
    recommendedRamGb: 10,
    icon: "google",
  },
  {
    id: "gemma-4-26b-a4b",
    name: "Gemma 4 26B-A4B GGUF",
    filename: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
    fileSizeGb: 16.9,
    sizeLabel: "16.9 GB",
    description: "Fast MoE with 256K context",
    maxContextLength: 262_144,
    contextLabel: "256K",
    minRamGb: 20,
    recommendedRamGb: 24,
    icon: "google",
    tag: "High Performance",
  },
  {
    id: "gemma-4-31b",
    name: "Gemma 4 31B GGUF",
    filename: "gemma-4-31B-it-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/gemma-4-31B-it-GGUF/resolve/main/gemma-4-31B-it-Q4_K_M.gguf",
    fileSizeGb: 19.0,
    sizeLabel: "19 GB",
    description: "Top-tier dense reasoning",
    maxContextLength: 262_144,
    contextLabel: "256K",
    minRamGb: 24,
    recommendedRamGb: 32,
    icon: "google",
    tag: "High Performance",
  },
  {
    id: "qwen-3.6-35b",
    name: "Qwen 3.6 35B-A3B GGUF",
    filename: "Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/main/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
    fileSizeGb: 22.1,
    sizeLabel: "22.1 GB",
    description: "Next-gen agentic coding MoE",
    maxContextLength: 262_144,
    contextLabel: "256K",
    minRamGb: 24,
    recommendedRamGb: 36,
    icon: "qwen",
    chatTemplateAsset: "qwen3.5-chat-template.jinja",
    tag: "New",
  },
  {
    id: "qwen-3.5-4b",
    name: "Qwen 3.5 4B GGUF",
    filename: "Qwen3.5-4B-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
    fileSizeGb: 2.7,
    sizeLabel: "2.7 GB",
    description: "Quality-size sweet spot",
    maxContextLength: 262_144,
    contextLabel: "256K",
    minRamGb: 6,
    recommendedRamGb: 8,
    icon: "qwen",
    chatTemplateAsset: "qwen3.5-chat-template.jinja",
  },
  {
    id: "qwen-3.5-9b",
    name: "Qwen 3.5 9B GGUF",
    filename: "Qwen3.5-9B-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf",
    fileSizeGb: 5.3,
    sizeLabel: "5.3 GB",
    description: "Balanced performance",
    maxContextLength: 262_144,
    contextLabel: "256K",
    minRamGb: 10,
    recommendedRamGb: 16,
    icon: "qwen",
    chatTemplateAsset: "qwen3.5-chat-template.jinja",
    tag: "Recommended",
  },
  {
    id: "qwen-3.5-35b",
    name: "Qwen 3.5 35B-A3B GGUF",
    filename: "Qwen3.5-35B-A3B-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/Qwen3.5-35B-A3B-GGUF/resolve/main/Qwen3.5-35B-A3B-Q4_K_M.gguf",
    fileSizeGb: 22.0,
    sizeLabel: "22 GB",
    description: "High quality reasoning",
    maxContextLength: 262_144,
    contextLabel: "256K",
    minRamGb: 24,
    recommendedRamGb: 36,
    icon: "qwen",
    chatTemplateAsset: "qwen3.5-chat-template.jinja",
    tag: "High Performance",
  },
  {
    id: "glm-4.7-flash-30b",
    name: "GLM 4.7 flash 30B GGUF",
    filename: "glm-4-9b-chat-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/bartowski/glm-4-9b-chat-GGUF/resolve/main/glm-4-9b-chat-Q4_K_M.gguf",
    fileSizeGb: 19.0,
    sizeLabel: "19 GB",
    description: "Lightweight deployment",
    maxContextLength: 131_072,
    contextLabel: "128K",
    minRamGb: 24,
    recommendedRamGb: 32,
    icon: "glm",
  },
  {
    id: "nemotron-3-nano-4b",
    name: "Nemotron 3 Nano 4B GGUF",
    filename: "NVIDIA-Nemotron-3-Nano-4B-Q8_0.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/NVIDIA-Nemotron-3-Nano-4B-GGUF/resolve/main/NVIDIA-Nemotron-3-Nano-4B-Q8_0.gguf",
    fileSizeGb: 4.23,
    sizeLabel: "4.2 GB",
    description: "Edge-optimized hybrid reasoning",
    maxContextLength: 262_144,
    contextLabel: "256K",
    minRamGb: 8,
    recommendedRamGb: 10,
    icon: "nvidia",
    chatTemplateAsset: "nemotron3-chat-template.jinja",
  },
  {
    id: "nemotron-3-nano-30b",
    name: "Nemotron 3 Nano 30B-A3B GGUF",
    filename: "Nemotron-3-Nano-30B-A3B-Q4_K_M.gguf",
    huggingFaceUrl:
      "https://huggingface.co/unsloth/Nemotron-3-Nano-30B-A3B-GGUF/resolve/main/Nemotron-3-Nano-30B-A3B-Q4_K_M.gguf",
    fileSizeGb: 24.6,
    sizeLabel: "24.6 GB",
    description: "High-quality MoE reasoning",
    maxContextLength: 1_048_576,
    contextLabel: "1M",
    minRamGb: 28,
    recommendedRamGb: 36,
    icon: "nvidia",
    chatTemplateAsset: "nemotron3-chat-template.jinja",
  },
];

export const DEFAULT_LLAMACPP_MODEL_ID: LlamacppModelId = "qwen-3.5-4b";

export function getLlamacppModelDef(id: LlamacppModelId): LlamacppModelDef {
  return LLAMACPP_MODELS.find((m) => m.id === id) ?? LLAMACPP_MODELS[0]!;
}

export function resolveLlamacppModelPath(dataDir: string, model: LlamacppModelDef): string {
  return path.join(dataDir, "models", model.id, model.filename);
}

/**
 * Resolve the filesystem path of a bundled chat-template asset.
 * In packaged builds assets live under process.resourcesPath;
 * in dev they sit in the repo assets/ directory.
 */
export function resolveChatTemplatePath(
  model: LlamacppModelDef,
  opts: { isPackaged: boolean; appPath: string }
): string | undefined {
  if (!model.chatTemplateAsset) return undefined;
  if (opts.isPackaged) {
    return path.join(process.resourcesPath, "ai-models", model.chatTemplateAsset);
  }
  return path.join(opts.appPath, "assets", "ai-models", model.chatTemplateAsset);
}
