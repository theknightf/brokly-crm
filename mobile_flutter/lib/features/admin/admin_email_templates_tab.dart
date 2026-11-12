import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/admin_models.dart';
import '../../data/services/admin_service.dart';
import 'admin_ui.dart';

class _Template {
  final AdminSettingItem row;
  final String subjectEn;
  final String bodyEn;
  final String subjectAr;
  final String bodyAr;
  const _Template(this.row, this.subjectEn, this.bodyEn, this.subjectAr, this.bodyAr);

  factory _Template.from(AdminSettingItem row) {
    Map<String, dynamic> extra = {};
    try {
      final d = jsonDecode(row.color ?? '{}');
      if (d is Map) extra = Map<String, dynamic>.from(d);
    } catch (_) {}
    return _Template(
      row,
      extra['subjectEn']?.toString() ?? '',
      extra['bodyEn']?.toString() ?? '',
      extra['subjectAr']?.toString() ?? '',
      extra['bodyAr']?.toString() ?? '',
    );
  }
}

/// Email templates stored in admin_settings (category "emailTemplate"; the
/// subject/body JSON lives in the `color` column, exactly like the web).
class AdminEmailTemplatesTab extends StatefulWidget {
  const AdminEmailTemplatesTab({super.key});

  @override
  State<AdminEmailTemplatesTab> createState() => _AdminEmailTemplatesTabState();
}

class _AdminEmailTemplatesTabState extends State<AdminEmailTemplatesTab> {
  final AdminService _service = AdminService();

  Future<List<_Template>> _load() async => (await _service.getSettings('emailTemplate')).map(_Template.from).toList();

  @override
  Widget build(BuildContext context) {
    return AdminLoader<List<_Template>>(
      loader: _load,
      builder: (context, list, reload) => [
        SectionHeader(
          title: 'Email templates',
          subtitle: 'Reusable subject and body pairs (English and Arabic)',
          trailing: AdminButton(label: 'New', icon: LucideIcons.plus, onPressed: () => _edit(context, null, list.length, reload)),
        ),
        if (list.isEmpty)
          const AdminEmptyBlock(icon: LucideIcons.mail, title: 'No templates yet', message: 'Tap "New" to create one.')
        else
          for (final t in list)
            PremiumCard(
              onTap: () => _edit(context, t, list.length, reload),
              child: Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(12)),
                  child: Icon(LucideIcons.mail, size: 18, color: Surf.accent(context)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(t.row.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
                    const SizedBox(height: 2),
                    Text(t.subjectEn.isEmpty ? '—' : t.subjectEn,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                  ]),
                ),
                IconButton(
                  tooltip: 'Delete template',
                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                  icon: const Icon(LucideIcons.trash2, size: 18),
                  onPressed: () => _delete(context, t, reload),
                ),
              ]),
            ),
      ],
    );
  }

  Future<void> _delete(BuildContext context, _Template t, Future<void> Function() reload) async {
    final ok = await confirmAction(
      context,
      title: 'Delete "${t.row.name}"?',
      message: 'This template will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    try {
      await _service.deleteSetting(t.row.id);
      if (context.mounted) adminSnack(context, 'Template deleted');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    }
  }

  Future<void> _edit(BuildContext context, _Template? t, int count, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(
      context,
      builder: (ctx) => _TemplateForm(service: _service, template: t, count: count),
    );
    if (saved == true) {
      if (context.mounted) adminSnack(context, t == null ? 'Template created' : 'Template updated');
      await reload();
    }
  }
}

class _TemplateForm extends StatefulWidget {
  final AdminService service;
  final _Template? template;
  final int count;
  const _TemplateForm({required this.service, required this.template, required this.count});

  @override
  State<_TemplateForm> createState() => _TemplateFormState();
}

class _TemplateFormState extends State<_TemplateForm> {
  late final TextEditingController _subjectEn = TextEditingController(text: widget.template?.subjectEn ?? '');
  late final TextEditingController _bodyEn = TextEditingController(text: widget.template?.bodyEn ?? '');
  late final TextEditingController _subjectAr = TextEditingController(text: widget.template?.subjectAr ?? '');
  late final TextEditingController _bodyAr = TextEditingController(text: widget.template?.bodyAr ?? '');
  bool _busy = false;

  @override
  void dispose() {
    _subjectEn.dispose();
    _bodyEn.dispose();
    _subjectAr.dispose();
    _bodyAr.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final json = jsonEncode({
      'subjectEn': _subjectEn.text,
      'bodyEn': _bodyEn.text,
      'subjectAr': _subjectAr.text,
      'bodyAr': _bodyAr.text,
    });
    try {
      final t = widget.template;
      if (t == null) {
        await widget.service.createSetting('emailTemplate', name: 'Template ${widget.count + 1}', color: json, order: 0, active: true);
      } else {
        await widget.service.updateSetting(t.row.id, name: t.row.name, color: json, order: 0, active: true);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        adminSnack(context, adminErr(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminSheetBody(
      title: widget.template == null ? 'New email template' : 'Edit email template',
      subtitle: 'Placeholders: {lead_name}, {property}, {date}',
      children: [
        AdminField(label: 'Subject (English)', controller: _subjectEn),
        AdminField(label: 'Body (English)', controller: _bodyEn, maxLines: 4),
        AdminField(label: 'Subject (Arabic)', controller: _subjectAr, direction: TextDirection.rtl),
        AdminField(label: 'Body (Arabic)', controller: _bodyAr, maxLines: 4, direction: TextDirection.rtl),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Save template', icon: LucideIcons.save, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }
}
