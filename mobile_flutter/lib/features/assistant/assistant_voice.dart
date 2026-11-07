import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

/// Voice for the assistant chat: speech-to-text (tap the mic, talk, the message is sent when you stop) and
/// text-to-speech (optional: read the replies aloud). Uses the phone's own engines, so there is no extra
/// cost or server call. Everything fails soft: if an engine is missing the chat still works by typing.
class AssistantVoice extends ChangeNotifier {
  static const _prefsKey = 'assistant.voiceReplies';
  static final _arabic = RegExp(r'[؀-ۿ]');

  final stt.SpeechToText _stt = stt.SpeechToText();
  final FlutterTts _tts = FlutterTts();

  bool _sttReady = false;
  bool _ttsReady = false;
  String? _arabicLocale;
  String _heard = '';

  bool listening = false;
  bool speaking = false;
  bool voiceReplies = false;

  /// Live partial transcript while the agent is speaking.
  void Function(String text)? onPartial;

  /// Final transcript when the agent stops speaking (already trimmed, never empty).
  void Function(String text)? onFinal;

  /// A short message for the UI when something went wrong (permission denied, no speech engine...).
  String? error;

  String? takeError() {
    final e = error;
    error = null;
    return e;
  }

  Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      voiceReplies = prefs.getBool(_prefsKey) ?? false;
    } catch (_) {}
    notifyListeners();
  }

  // ── speech to text ──────────────────────────────────────────────────────────

  Future<void> toggleListening() => listening ? stopListening() : startListening();

  Future<void> startListening() async {
    await stopSpeaking(); // the mic must not hear the assistant's own voice
    if (!_sttReady) {
      try {
        _sttReady = await _stt.initialize(onStatus: _onStatus, onError: _onError);
      } catch (_) {
        _sttReady = false;
      }
      if (!_sttReady) {
        error = 'تعذّر تشغيل الميكروفون. اسمح للتطبيق باستخدام الميكروفون وتأكد من وجود خدمة التعرف على الكلام.';
        notifyListeners();
        return;
      }
      try {
        final locales = await _stt.locales();
        for (final l in locales) {
          final id = l.localeId.toLowerCase().replaceAll('-', '_');
          if (id == 'ar_eg') {
            _arabicLocale = l.localeId;
            break;
          }
          if (id.startsWith('ar') && _arabicLocale == null) _arabicLocale = l.localeId;
        }
      } catch (_) {}
    }

    _heard = '';
    listening = true;
    notifyListeners();
    try {
      await _stt.listen(
        onResult: (r) {
          _heard = r.recognizedWords;
          onPartial?.call(_heard);
          if (r.finalResult) _finish();
        },
        // These three moved into SpeechListenOptions in newer releases but still work; kept here so the code
        // compiles on every 7.x version.
        // ignore: deprecated_member_use
        localeId: _arabicLocale, // null = the phone's default language
        // ignore: deprecated_member_use
        listenFor: const Duration(seconds: 40),
        // ignore: deprecated_member_use
        pauseFor: const Duration(seconds: 3),
        listenOptions: stt.SpeechListenOptions(
          partialResults: true,
          cancelOnError: true,
          listenMode: stt.ListenMode.dictation,
        ),
      );
    } catch (_) {
      listening = false;
      error = 'تعذّر بدء التسجيل الصوتي.';
      notifyListeners();
    }
  }

  Future<void> stopListening() async {
    try {
      await _stt.stop();
    } catch (_) {}
    _finish();
  }

  void _onStatus(String status) {
    if (status == 'done' || status == 'notListening') _finish();
  }

  void _onError(SpeechRecognitionError e) {
    final permission = e.errorMsg.contains('permission');
    final silent = e.errorMsg.contains('no_match') || e.errorMsg.contains('speech_timeout');
    if (permission) {
      error = 'اسمح للتطبيق باستخدام الميكروفون من إعدادات الهاتف.';
    } else if (silent) {
      error = 'ما سمعتش حاجة، جرّب تاني.';
    } else {
      error = 'تعذّر التسجيل الصوتي، حاول مرة أخرى.';
    }
    final hadText = _heard.trim().isNotEmpty;
    if (!hadText) {
      listening = false;
      notifyListeners();
    } else {
      _finish(); // send what was heard before the error
    }
  }

  /// Ends the listening session once and hands the text over. Safe to call from several callbacks.
  void _finish() {
    if (!listening) return;
    listening = false;
    final text = _heard.trim();
    _heard = '';
    notifyListeners();
    if (text.isNotEmpty) onFinal?.call(text);
  }

  // ── text to speech ──────────────────────────────────────────────────────────

  Future<void> setVoiceReplies(bool value) async {
    voiceReplies = value;
    if (!value) await stopSpeaking();
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefsKey, value);
    } catch (_) {}
  }

  Future<void> _initTts() async {
    if (_ttsReady) return;
    try {
      _tts.setStartHandler(() {
        speaking = true;
        notifyListeners();
      });
      _tts.setCompletionHandler(() {
        speaking = false;
        notifyListeners();
      });
      _tts.setCancelHandler(() {
        speaking = false;
        notifyListeners();
      });
      _tts.setErrorHandler((_) {
        speaking = false;
        notifyListeners();
      });
      await _tts.setSpeechRate(0.5);
      _ttsReady = true;
    } catch (_) {
      _ttsReady = false;
    }
  }

  /// Plain text for the speech engine: no markdown markers, links or emoji.
  static String toSpeakable(String raw) {
    return raw
        .replaceAll(RegExp(r'```[\s\S]*?```'), ' ')
        .replaceAll(RegExp(r'\[([^\]]+)\]\([^)]+\)'), r'$1')
        .replaceAll(RegExp(r'https?://\S+'), ' ')
        .replaceAll(RegExp(r'[*_`#>|~]+'), ' ')
        .replaceAll(RegExp(r'[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]', unicode: true), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  Future<void> speak(String raw) async {
    final text = toSpeakable(raw);
    if (text.isEmpty) return;
    await _initTts();
    if (!_ttsReady) return;
    try {
      await _tts.stop();
      await _tts.setLanguage(_arabic.hasMatch(text) ? 'ar-EG' : 'en-US');
      // Android's TextToSpeech rejects more than ~4000 characters in one call.
      await _tts.speak(text.length > 3500 ? text.substring(0, 3500) : text);
    } catch (_) {
      speaking = false;
      notifyListeners();
    }
  }

  Future<void> stopSpeaking() async {
    try {
      await _tts.stop();
    } catch (_) {}
    if (speaking) {
      speaking = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    try {
      _stt.cancel();
      _tts.stop();
    } catch (_) {}
    super.dispose();
  }
}
