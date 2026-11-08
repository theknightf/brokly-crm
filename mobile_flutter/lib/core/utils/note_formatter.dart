import 'tr.dart';

/// One readable line of the lead's activity log.
class NoteLogEntry {
  final String raw;
  final String? time; // e.g. "3 Nov 13:54"
  final String title; // e.g. "Outgoing call · Answered"
  final String? detail; // the agent's own words, if any

  const NoteLogEntry({required this.raw, this.time, required this.title, this.detail});
}

class ParsedNotes {
  /// What a person wrote (no machine log lines). This is what the Notes field shows and edits.
  final String humanText;

  /// Log lines the app wrote for calls, readable.
  final List<NoteLogEntry> log;

  /// The original log lines, kept so saving the human text never drops them.
  final List<String> rawLogLines;

  const ParsedNotes({required this.humanText, required this.log, required this.rawLogLines});

  /// Puts the human text and the untouched log lines back together for saving.
  String merge(String editedHuman) {
    final parts = <String>[];
    final h = editedHuman.trim();
    if (h.isNotEmpty) parts.add(h);
    parts.addAll(rawLogLines);
    return parts.join('\n');
  }
}

/// leads.notes is one text blob: people type in it, and the app appends machine lines such as
/// "[Device Call Sync • 2026-11-03 13:54] Outgoing Call (Answered) • Duration: 40s" and
/// "[2026-11-03 13:55] [Call • Not Interested • 40s] text". This turns them into readable entries.
class NoteFormatter {
  static final _device = RegExp(
    r'^\[Device Call Sync\s*•\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\]\s*(.*?)\s*\((.*?)\)\s*(?:•\s*Duration:\s*(\d+)s)?\s*$',
    caseSensitive: false,
  );
  static final _call = RegExp(
    r'^\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\]\s*\[(Call|WhatsApp)\s*•\s*(.*?)\s*•\s*(\d+)s\]\s*(.*)$',
    caseSensitive: false,
  );
  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  static String _when(String date, String hm) {
    final p = date.split('-');
    final m = int.tryParse(p[1]) ?? 1;
    return '${int.tryParse(p[2]) ?? 0} ${_months[(m - 1).clamp(0, 11)]} $hm';
  }

  static String _dur(int s) {
    if (s <= 0) return tr('no talk time', 'بدون مكالمة');
    if (s < 60) return '${s}s';
    final m = s ~/ 60;
    final r = s % 60;
    return r == 0 ? '${m}m' : '${m}m ${r}s';
  }

  static String _callType(String raw) {
    final t = raw.toLowerCase();
    if (t.contains('missed')) return tr('Missed call', 'مكالمة فائتة');
    if (t.contains('incoming')) return tr('Incoming call', 'مكالمة واردة');
    if (t.contains('outgoing')) return tr('Outgoing call', 'مكالمة صادرة');
    return raw;
  }

  static NoteLogEntry? _parseLine(String line) {
    final d = _device.firstMatch(line);
    if (d != null) {
      final secs = int.tryParse(d.group(5) ?? '') ?? 0;
      return NoteLogEntry(
        raw: line,
        time: _when(d.group(1)!, d.group(2)!),
        title: '${_callType(d.group(3)!)} · ${d.group(4)} · ${_dur(secs)}',
      );
    }
    final c = _call.firstMatch(line);
    if (c != null) {
      final text = (c.group(6) ?? '').trim();
      final isCall = c.group(3)!.toLowerCase() == 'call';
      return NoteLogEntry(
        raw: line,
        time: _when(c.group(1)!, c.group(2)!),
        title: '${isCall ? tr('Call', 'مكالمة') : 'WhatsApp'} · ${c.group(4)} · ${_dur(int.tryParse(c.group(5)!) ?? 0)}',
        detail: text.isEmpty || text == 'Call outcome logged' ? null : text,
      );
    }
    return null;
  }

  static ParsedNotes parse(String? notes) {
    final human = <String>[];
    final log = <NoteLogEntry>[];
    final raw = <String>[];
    for (final l in (notes ?? '').split('\n')) {
      final line = l.trim();
      if (line.isEmpty) continue;
      final e = _parseLine(line);
      if (e != null) {
        log.add(e);
        raw.add(line);
      } else {
        human.add(line);
      }
    }
    return ParsedNotes(humanText: human.join('\n'), log: log.reversed.toList(), rawLogLines: raw);
  }

  /// One readable sentence for any note line (used where lines are shown one by one).
  static String pretty(String line) {
    final e = _parseLine(line.trim());
    if (e == null) return line;
    final head = '${e.time != null ? '${e.time} · ' : ''}${e.title}';
    return e.detail == null ? head : '$head\n${e.detail}';
  }
}
