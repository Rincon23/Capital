'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Recording {
  audio: Blob;
  seconds: number;
}

/** Opus in webm on Chrome/Android, mp4 on Safari; whisper's server converts any of them. */
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function microphoneError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'O microfone está bloqueado para o Capital. Libere nas permissões do navegador e tente de novo.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Nenhum microfone encontrado neste aparelho.';
  if (name === 'NotReadableError') return 'Outro app está usando o microfone. Feche-o e tente de novo.';
  return 'Não foi possível usar o microfone. Tente de novo ou escreva o gasto.';
}

/**
 * Records one clip with MediaRecorder, up to `maxSeconds` (it stops by itself there), and
 * hands it to `onFinish`. The microphone is released as soon as the recording ends.
 */
export function useAudioRecorder({
  maxSeconds,
  onFinish,
}: {
  maxSeconds: number;
  onFinish: (recording: Recording) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cancelledRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(
        'Este navegador não grava áudio aqui. O microfone só funciona com HTTPS; você ainda pode escrever o gasto.',
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      setError(microphoneError(err));
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined,
    );
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    cancelledRef.current = false;
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= maxSeconds * 1000) stop();
    }, 200);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      setRecording(false);
      const seconds = Math.min((performance.now() - startedAt) / 1000, maxSeconds);
      if (cancelledRef.current) return;
      const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      if (audio.size === 0 || seconds < 0.5) {
        setError('A gravação ficou curta demais. Segure um pouco mais e fale o gasto.');
        return;
      }
      onFinishRef.current({ audio, seconds });
    };

    recorderRef.current = recorder;
    setElapsedMs(0);
    setRecording(true);
    recorder.start();
  }, [maxSeconds, stop]);

  // Leaving the screen mid-recording discards it and frees the microphone.
  useEffect(() => cancel, [cancel]);

  return { recording, elapsedMs, error, start, stop, cancel };
}
