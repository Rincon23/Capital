import { acquireAnalysisSlot, progressStream, requireVoiceAccess } from '@/lib/server/ai/access';
import { analyzeExpense } from '@/lib/server/ai/engine';
import { apiRoute, HttpError } from '@/lib/server/http';

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

/** A recording (multipart: `audio`, `seconds`) → a draft for review, streaming the progress. */
export const POST = apiRoute(async ({ request, repo, email, access }) => {
  const voice = await requireVoiceAccess(repo, email, await access(), { countAttempt: true });
  // The upload must say how big it is (one of unknown size is refused) and be small.
  const declaredSize = Number(request.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(declaredSize) || declaredSize > MAX_AUDIO_BYTES + 64_000) {
    throw new HttpError(413, 'AUDIO_TOO_LARGE', 'O áudio passou de 5 MB. Grave um trecho mais curto.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'Envie o áudio gravado.');
  }
  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    throw new HttpError(400, 'INVALID_INPUT', 'O áudio chegou vazio. Grave de novo.');
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new HttpError(413, 'AUDIO_TOO_LARGE', 'O áudio passou de 5 MB. Grave um trecho mais curto.');
  }
  // Only the formats the app's recorder produces go on to whisper (and its ffmpeg).
  const extension = EXTENSIONS[audio.type.split(';')[0]];
  if (!extension) {
    throw new HttpError(415, 'AUDIO_FORMAT', 'Formato de áudio não suportado. Grave pelo app.');
  }
  const declared = Number(form.get('seconds'));
  const seconds = Number.isFinite(declared) && declared > 0 ? Math.min(declared, 120) : audio.size / 4000;

  const release = acquireAnalysisSlot();
  const label = `áudio (${seconds.toFixed(1)} s, ${Math.round(audio.size / 1024)} KB, ${audio.type})`;
  return progressStream(
    request,
    label,
    (emit, signal) =>
      analyzeExpense(
        { kind: 'audio', audio, filename: `gasto.${extension}`, seconds },
        { options: voice.options, today: voice.today, signal },
        voice,
        emit,
      ),
    release,
  );
});
