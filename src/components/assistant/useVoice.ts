'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser voice for the assistant: speech-to-text (Web Speech API) and text-to-speech (speechSynthesis).
 * No server calls and no extra packages. Both are feature-detected: where a browser lacks one
 * (e.g. Firefox has no speech recognition) the matching button is simply hidden by the caller.
 */

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

const ARABIC = /[؀-ۿ]/;

/** Plain text for the speech engine: no markdown, links or emoji noise. */
export function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>|~-]{1,}/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Options {
  /** Recognition language, e.g. 'ar-EG' (Egyptian Arabic) or 'en-US'. */
  lang?: string;
  /** Live partial transcript while the user is speaking. */
  onInterim?: (text: string) => void;
  /** Final transcript once the user stops speaking. */
  onFinal?: (text: string) => void;
  /** Recognition error (permission denied, no speech, network...). */
  onError?: (code: string) => void;
}

export function useVoice({ lang = 'ar-EG', onInterim, onFinal, onError }: Options = {}) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supportsListening, setSupportsListening] = useState(false);
  const [supportsSpeaking, setSupportsSpeaking] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const finalRef = useRef('');
  const cbRef = useRef({ onInterim, onFinal, onError });
  cbRef.current = { onInterim, onFinal, onError };

  useEffect(() => {
    const w = window as any;
    setSupportsListening(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    setSupportsSpeaking(typeof window.speechSynthesis !== 'undefined');
    // Some browsers load voices lazily; touching the list makes the first speak() find them.
    window.speechSynthesis?.getVoices?.();
    return () => {
      try {
        recRef.current?.abort();
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (raw: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const text = toSpeakable(raw);
      if (!text) return;
      window.speechSynthesis.cancel();
      const isArabic = ARABIC.test(text);
      const wanted = isArabic ? 'ar' : 'en';
      const utter = new SpeechSynthesisUtterance(text.slice(0, 1200));
      utter.lang = isArabic ? 'ar-EG' : 'en-US';
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) => v.lang.toLowerCase() === utter.lang.toLowerCase()) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(wanted));
      if (voice) utter.voice = voice;
      utter.rate = 1;
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utter);
    },
    []
  );

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const startListening = useCallback(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      cbRef.current.onError?.('unsupported');
      return;
    }
    // Never talk over the assistant: the mic would transcribe its own voice.
    stopSpeaking();
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }

    const rec: RecognitionLike = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    finalRef.current = '';

    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      cbRef.current.onInterim?.((finalRef.current + interim).trim());
    };
    rec.onerror = (e: any) => {
      cbRef.current.onError?.(String(e?.error || 'error'));
    };
    rec.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      finalRef.current = '';
      if (text) cbRef.current.onFinal?.(text);
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
      cbRef.current.onError?.('start-failed');
    }
  }, [lang, stopSpeaking]);

  return {
    listening,
    speaking,
    supportsListening,
    supportsSpeaking,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
