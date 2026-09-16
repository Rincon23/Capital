import 'server-only';

/**
 * The AI that runs on the Orange Pi: whisper.cpp for speech and Ollama for reading the
 * expense. Both are free and local (decision P10); the app only talks to these interfaces,
 * so another provider could be added later without touching the rest.
 */
export interface Transcriber {
  /** The text said in `audio` (any format ffmpeg reads; the server converts it). */
  transcribe(audio: Blob, filename: string, signal: AbortSignal): Promise<string>;
}

export interface GenerateOptions {
  /** JSON schema the answer must follow. */
  schema?: Record<string, unknown>;
  maxTokens: number;
  signal: AbortSignal;
  /** The prompt has been read and the first token is out. */
  onFirstToken?: () => void;
  onToken?: (count: number) => void;
}

export interface ExpenseExtractor {
  /** Whether the model is already in memory. */
  isLoaded(signal: AbortSignal): Promise<boolean>;
  /** Loads the model into memory and resolves once it is ready. */
  load(signal: AbortSignal): Promise<void>;
  /** Streams the model's answer to `prompt`; resolves with all of it. */
  generate(prompt: string, options: GenerateOptions): Promise<{ text: string; tokens: number }>;
}

export interface AiConfig {
  whisperUrl: string;
  ollamaUrl: string;
  ollamaModel: string;
}

/** WHISPER_URL, OLLAMA_URL and OLLAMA_MODEL; null when the AI isn't set up on this server. */
export function aiConfig(): AiConfig | null {
  const whisperUrl = process.env.WHISPER_URL?.trim().replace(/\/+$/, '');
  const ollamaUrl = process.env.OLLAMA_URL?.trim().replace(/\/+$/, '');
  if (!whisperUrl || !ollamaUrl) return null;
  return { whisperUrl, ollamaUrl, ollamaModel: process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:1.5b' };
}

/** whisper.cpp's `whisper-server`, started with `--convert` so it accepts the browser's webm. */
export class WhisperTranscriber implements Transcriber {
  constructor(private readonly baseUrl: string) {}

  async transcribe(audio: Blob, filename: string, signal: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append('file', audio, filename);
    form.append('language', 'pt');
    form.append('response_format', 'json');
    const response = await fetch(`${this.baseUrl}/inference`, { method: 'POST', body: form, signal });
    const payload = (await response.json().catch(() => null)) as { text?: unknown; error?: unknown } | null;
    if (!response.ok || !payload || typeof payload.text !== 'string') {
      throw new Error(`whisper respondeu ${response.status}: ${String(payload?.error ?? 'sem texto')}`);
    }
    return payload.text;
  }
}

/** Tells when streamed text has closed its top-level JSON object (braces inside strings don't count). */
export class JsonEnd {
  private depth = 0;
  private started = false;
  private inString = false;
  private escaped = false;

  /** Feeds more text; true once the object is complete. */
  feed(piece: string): boolean {
    for (const char of piece) {
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.inString = false;
      } else if (char === '"') {
        this.inString = true;
      } else if (char === '{') {
        this.depth += 1;
        this.started = true;
      } else if (char === '}') {
        this.depth -= 1;
        if (this.started && this.depth === 0) return true;
      }
    }
    return false;
  }
}

interface OllamaChunk {
  response?: string;
  done?: boolean;
  eval_count?: number;
  error?: string;
}

export class OllamaExtractor implements ExpenseExtractor {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async isLoaded(signal: AbortSignal): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/ps`, { signal });
    if (!response.ok) throw new Error(`ollama /api/ps respondeu ${response.status}`);
    const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    return (payload.models ?? []).some((m) => m.name === this.model || m.model === this.model);
  }

  async load(signal: AbortSignal): Promise<void> {
    // A generate request without a prompt only loads the model.
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model: this.model, stream: false }),
      signal,
    });
    if (!response.ok) throw new Error(`ollama não carregou o modelo (${response.status})`);
    await response.body?.cancel();
  }

  async generate(prompt: string, options: GenerateOptions): Promise<{ text: string; tokens: number }> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: true,
        ...(options.schema ? { format: options.schema } : {}),
        options: { temperature: 0, num_predict: options.maxTokens },
      }),
      signal: options.signal,
    });
    if (!response.ok || !response.body) throw new Error(`ollama respondeu ${response.status}`);

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const json = options.schema ? new JsonEnd() : null;
    let buffer = '';
    let text = '';
    let tokens = 0;
    let complete = false;
    const handle = (line: string) => {
      if (!line.trim()) return;
      const chunk = JSON.parse(line) as OllamaChunk;
      if (chunk.error) throw new Error(`ollama: ${chunk.error}`);
      if (chunk.response) {
        tokens += 1;
        if (tokens === 1) options.onFirstToken?.();
        text += chunk.response;
        options.onToken?.(tokens);
        if (json?.feed(chunk.response)) complete = true;
      }
      if (chunk.done && chunk.eval_count) tokens = chunk.eval_count;
    };
    while (!complete) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline: number;
      while (!complete && (newline = buffer.indexOf('\n')) !== -1) {
        handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    if (complete) {
      // The object is closed; on the Pi the model can idle for seconds before stopping. Cancelling
      // the stream ends the request, and Ollama stops generating.
      await reader.cancel().catch(() => undefined);
    } else {
      handle(buffer);
    }
    return { text, tokens };
  }
}
