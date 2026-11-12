import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/admin_models.dart';
import '../../data/services/admin_service.dart';
import 'admin_ui.dart';

/// CRM-setup lists backed by admin_settings (and `developers`):
/// lead sources, pipeline stages, areas, priorities, developers.
enum AdminSettingsKind { leadSources, pipelineStages, areas, priorities, developers }

extension on AdminSettingsKind {
  String get title => switch (this) {
        AdminSettingsKind.leadSources => 'Lead Sources',
        AdminSettingsKind.pipelineStages => 'Pipeline Stages',
        AdminSettingsKind.areas => 'Areas',
        AdminSettingsKind.priorities => 'Priorities',
        AdminSettingsKind.developers => 'Developers',
      };

  String get subtitle => switch (this) {
        AdminSettingsKind.leadSources => 'Channels where leads originate',
        AdminSettingsKind.pipelineStages => 'Sales pipeline stages from new lead to closed',
        AdminSettingsKind.areas => 'Geographic areas for lead and project targeting',
        AdminSettingsKind.priorities => 'Lead priority levels',
        AdminSettingsKind.developers => 'Real estate developers linked to projects and leads',
      };

  String get singular => switch (this) {
        AdminSettingsKind.leadSources => 'lead source',
        AdminSettingsKind.pipelineStages => 'pipeline stage',
        AdminSettingsKind.areas => 'area',
        AdminSettingsKind.priorities => 'priority',
        AdminSettingsKind.developers => 'developer',
      };

  /// admin_settings.category value (null for developers, which has its own table).
  String? get category => switch (this) {
        AdminSettingsKind.leadSources => 'leadSources',
        AdminSettingsKind.pipelineStages => 'pipelineStages',
        AdminSettingsKind.areas => 'areas',
        AdminSettingsKind.priorities => 'priorities',
        AdminSettingsKind.developers => null,
      };

  bool get hasColor =>
      this == AdminSettingsKind.leadSources || this == AdminSettingsKind.pipelineStages || this == AdminSettingsKind.priorities;
  bool get hasOrder => this == AdminSettingsKind.pipelineStages || this == AdminSettingsKind.priorities;
}

Color? _parseHex(String? hex) {
  if (hex == null) return null;
  var h = hex.trim().replaceFirst('#', '');
  if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
  if (h.length != 6) return null;
  final v = int.tryParse(h, radix: 16);
  return v == null ? null : Color(0xFF000000 | v);
}

const List<String> _swatches = [
  '#84cc16', '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#94a3b8',
];

class AdminSettingsListTab extends StatefulWidget {
  final AdminSettingsKind kind;
  const AdminSettingsListTab({super.key, required this.kind});

  @override
  State<AdminSettingsListTab> createState() => _AdminSettingsListTabState();
}

class _AdminSettingsListTabState extends State<AdminSettingsListTab> {
  final AdminService _service = AdminService();

  Future<List<AdminSettingItem>> _load() async {
    final k = widget.kind;
    final items = k == AdminSettingsKind.developers ? await _service.getDevelopers() : await _service.getSettings(k.category!);
    if (k.hasOrder) items.sort((a, b) => a.order.compareTo(b.order));
    return items;
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.kind;
    return AdminLoader<List<AdminSettingItem>>(
      key: ValueKey(k),
      loader: _load,
      builder: (context, items, reload) => [
        SectionHeader(
          title: k.title,
          subtitle: k.subtitle,
          trailing: AdminButton(label: 'Add', icon: LucideIcons.plus, onPressed: () => _edit(context, null, items, reload)),
        ),
        if (items.isEmpty)
          AdminEmptyBlock(icon: LucideIcons.listPlus, title: 'No ${k.title.toLowerCase()} yet', message: 'Tap "Add" to create one.')
        else
          for (final it in items) _itemCard(context, it, items, reload),
      ],
    );
  }

  Widget _itemCard(BuildContext context, AdminSettingItem it, List<AdminSettingItem> items, Future<void> Function() reload) {
    final k = widget.kind;
    final color = _parseHex(it.color);
    return PremiumCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      onTap: () => _edit(context, it, items, reload),
      child: Row(children: [
        if (k.hasColor)
          Container(
            width: 14,
            height: 14,
            margin: const EdgeInsets.only(right: 12),
            decoration: BoxDecoration(color: color ?? Surf.subtext(context), shape: BoxShape.circle),
          ),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(it.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
            if (k.hasOrder)
              Text('Order ${it.order}', style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular)),
          ]),
        ),
        Switch(
          value: it.active,
          onChanged: (v) async {
            try {
              if (k == AdminSettingsKind.developers) {
                await _service.updateDeveloper(it.id, it.name, v);
              } else {
                await _service.updateSetting(it.id, name: it.name, color: it.color, order: it.order, active: v);
              }
              await reload();
            } catch (e) {
              if (context.mounted) adminSnack(context, adminErr(e), error: true);
            }
          },
        ),
        IconButton(
          tooltip: 'Delete',
          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          icon: const Icon(LucideIcons.trash2, size: 18),
          onPressed: () => _delete(context, it, reload),
        ),
      ]),
    );
  }

  Future<void> _delete(BuildContext context, AdminSettingItem it, Future<void> Function() reload) async {
    final ok = await confirmAction(
      context,
      title: 'Delete "${it.name}"?',
      message: 'This removes the ${widget.kind.singular} from CRM settings. Existing records are not changed.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    try {
      if (widget.kind == AdminSettingsKind.developers) {
        await _service.deleteDeveloper(it.id);
      } else {
        await _service.deleteSetting(it.id);
      }
      if (context.mounted) adminSnack(context, 'Deleted');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    }
  }

  Future<void> _edit(BuildContext context, AdminSettingItem? it, List<AdminSettingItem> items, Future<void> Function() reload) async {
    final nextOrder = items.isEmpty ? 1 : items.map((e) => e.order).reduce((a, b) => a > b ? a : b) + 1;
    final saved = await showPremiumSheet<bool>(
      context,
      builder: (ctx) => _SettingForm(service: _service, kind: widget.kind, item: it, nextOrder: nextOrder),
    );
    if (saved == true) {
      if (context.mounted) adminSnack(context, it == null ? 'Added' : 'Saved');
      await reload();
    }
  }
}

class _SettingForm extends StatefulWidget {
  final AdminService service;
  final AdminSettingsKind kind;
  final AdminSettingItem? item;
  final int nextOrder;
  const _SettingForm({required this.service, required this.kind, required this.item, required this.nextOrder});

  @override
  State<_SettingForm> createState() => _SettingFormState();
}

class _SettingFormState extends State<_SettingForm> {
  late final TextEditingController _name = TextEditingController(text: widget.item?.name ?? '');
  late final TextEditingController _color = TextEditingController(text: widget.item?.color ?? '#84cc16');
  late final TextEditingController _order = TextEditingController(text: '${widget.item?.order ?? widget.nextOrder}');
  late bool _active = widget.item?.active ?? true;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _color.dispose();
    _order.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Name is required');
      return;
    }
    final k = widget.kind;
    final color = k.hasColor ? (_parseHex(_color.text) == null ? null : _color.text.trim()) : null;
    final order = k.hasOrder ? (int.tryParse(_order.text.trim()) ?? 0) : 0;
    setState(() => _busy = true);
    try {
      final it = widget.item;
      if (k == AdminSettingsKind.developers) {
        it == null ? await widget.service.createDeveloper(name) : await widget.service.updateDeveloper(it.id, name, _active);
      } else if (it == null) {
        await widget.service.createSetting(k.category!, name: name, color: color, order: order, active: _active);
      } else {
        await widget.service.updateSetting(it.id, name: name, color: color, order: order, active: _active);
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
    final k = widget.kind;
    final selected = _parseHex(_color.text);
    return AdminSheetBody(
      title: '${widget.item == null ? 'Add' : 'Edit'} ${k.singular}',
      children: [
        AdminField(
          label: 'Name *',
          controller: _name,
          errorText: _error,
          onChanged: (_) => setState(() => _error = null),
        ),
        if (k.hasColor) ...[
          Text('Color', style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
          const SizedBox(height: 6),
          Wrap(spacing: 4, runSpacing: 4, children: [
            for (final s in _swatches)
              InkResponse(
                radius: 26,
                onTap: () => setState(() => _color.text = s),
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Center(
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: _parseHex(s),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: selected != null && selected == _parseHex(s) ? Surf.text(context) : Colors.transparent,
                          width: 2.5,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ]),
          const SizedBox(height: 8),
          AdminField(label: 'Hex color', controller: _color, hint: '#84cc16', onChanged: (_) => setState(() {})),
        ],
        if (k.hasOrder) AdminField(label: 'Display order', controller: _order, keyboard: TextInputType.number),
        if (widget.item != null || k != AdminSettingsKind.developers)
          AdminSwitchRow(label: 'Active', value: _active, onChanged: (v) => setState(() => _active = v)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: widget.item == null ? 'Add' : 'Save', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }
}
