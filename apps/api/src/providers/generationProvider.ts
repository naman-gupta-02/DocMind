import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GenerationContextChunk {
  /** 1-based citation number shown to the model and echoed back in its [n] markers. */
  index: number;
  text: string;
  filename: string;
  page: number;
}

export interface GenerationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateAnswerOptions {
  question: string;
  context: GenerationContextChunk[];
  history: GenerationTurn[];
  onToken: (token: string) => void;
}

export interface GenerationProvider {
  generate(options: GenerateAnswerOptions): Promise<string>;
}

const SYSTEM_INSTRUCTIONS = `You are DocMind, a RAG assistant that answers questions using ONLY the numbered source excerpts provided in the prompt.
Rules:
- Cite every claim with the bracketed source number it came from, e.g. [1] or [2][3].
- If the sources don't contain enough information to answer, say so explicitly instead of guessing.
- Never fabricate information that isn't in the sources.
- Be concise and direct.`;

function buildPrompt(question: string, context: GenerationContextChunk[]): string {
  const sourceBlock =
    context.length > 0
      ? context.map((c) => `[${c.index}] (${c.filename}, p.${c.page})\n${c.text}`).join('\n\n')
      : '(no relevant sources were found for this question)';
  return `Sources:\n${sourceBlock}\n\nQuestion: ${question}`;
}

export class GeminiGenerationProvider implements GenerationProvider {
  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generate(options: GenerateAnswerOptions): Promise<string> {
    const { question, context, history, onToken } = options;
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: SYSTEM_INSTRUCTIONS,
    });

    const chat = model.startChat({
      history: history.map((turn) => ({
        role: turn.role === 'user' ? 'user' : 'model',
        parts: [{ text: turn.content }],
      })),
    });

    const result = await chat.sendMessageStream(buildPrompt(question, context));
    let full = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        full += text;
        onToken(text);
      }
    }
    return full;
  }
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaStreamLine {
  message?: { content?: string };
  done?: boolean;
}

/**
 * Talks to a local Ollama server (https://ollama.com) — free, unlimited, no API key. Useful as a
 * drop-in generation provider when a hosted vendor's quota isn't available; same
 * GenerationProvider interface as GeminiGenerationProvider, so swapping is a one-line env change.
 */
export class OllamaGenerationProvider implements GenerationProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly modelName: string,
  ) {}

  async generate(options: GenerateAnswerOptions): Promise<string> {
    const { question, context, history, onToken } = options;

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: SYSTEM_INSTRUCTIONS },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: buildPrompt(question, context) },
    ];

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.modelName, messages, stream: true }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
    }

    let full = '';
    let buffer = '';
    const decoder = new TextDecoder();

    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (!line) continue;

        const parsed = JSON.parse(line) as OllamaStreamLine;
        const token = parsed.message?.content;
        if (token) {
          full += token;
          onToken(token);
        }
        if (parsed.done) return full;
      }
    }

    return full;
  }
}

export type GenerationProviderName = 'gemini' | 'ollama';

export interface GenerationProviderConfig {
  geminiApiKey: string;
  geminiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
}

export function createGenerationProvider(
  provider: GenerationProviderName,
  config: GenerationProviderConfig,
): GenerationProvider {
  switch (provider) {
    case 'gemini':
      return new GeminiGenerationProvider(config.geminiApiKey, config.geminiModel);
    case 'ollama':
      return new OllamaGenerationProvider(config.ollamaBaseUrl, config.ollamaModel);
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unknown generation provider: ${exhaustiveCheck}`);
    }
  }
}
