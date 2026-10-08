import 'package:flutter/material.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class CallerIdOverlayWidget extends StatefulWidget {
  const CallerIdOverlayWidget({super.key});

  @override
  State<CallerIdOverlayWidget> createState() => _CallerIdOverlayWidgetState();
}

class _CallerIdOverlayWidgetState extends State<CallerIdOverlayWidget> {
  String _name = 'Incoming Call';
  String _phone = '';
  String _status = 'Fresh Lead';
  String _project = 'Mountain View iCity';
  String _budget = '3,500,000 ج.م';

  @override
  void initState() {
    super.initState();
    FlutterOverlayWindow.overlayListener.listen((data) {
      if (data is Map) {
        setState(() {
          _name = data['name']?.toString() ?? _name;
          _phone = data['phone']?.toString() ?? _phone;
          _status = data['status']?.toString() ?? _status;
          _project = data['project']?.toString() ?? _project;
          _budget = data['budget']?.toString() ?? _budget;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF0D1117), // Deep Obsidian background
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: const Color(0xFFA3E635), // Neon Lime border
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFA3E635).withAlpha(40),
                blurRadius: 18,
                spreadRadius: 2,
              ),
              BoxShadow(
                color: Colors.black.withAlpha(200),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Row: Logo, Brand badge, Dismiss X
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFA3E635),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(LucideIcons.phoneIncoming, size: 11, color: Color(0xFF142407)),
                            SizedBox(width: 4),
                            Text(
                              'BROKLY CRM CALLER ID',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF142407),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1F2937),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          _status,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFFA3E635),
                          ),
                        ),
                      ),
                    ],
                  ),
                  InkWell(
                    onTap: () => FlutterOverlayWindow.closeOverlay(),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(
                        color: Color(0xFF21262D),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(LucideIcons.x, size: 14, color: Colors.white70),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Contact Name & Phone
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFFA3E635),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFA3E635).withAlpha(80),
                          blurRadius: 6,
                        ),
                      ],
                    ),
                    child: Center(
                      child: Text(
                        _name.trim().isNotEmpty ? _name.trim()[0].toUpperCase() : 'C',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF142407),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _name,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _phone,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: Color(0xFF9CA3AF),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Project & Budget Info Card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF161B22),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF21262D)),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.building2, size: 14, color: Color(0xFFA3E635)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _project,
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(LucideIcons.coins, size: 14, color: Color(0xFFF59E0B)),
                    const SizedBox(width: 4),
                    Text(
                      _budget,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFF59E0B)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Quick Actions: Open in CRM and Dismiss
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 36,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white70,
                          side: const BorderSide(color: Color(0xFF21262D)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: EdgeInsets.zero,
                        ),
                        onPressed: () => FlutterOverlayWindow.closeOverlay(),
                        child: const Text('Dismiss', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: SizedBox(
                      height: 36,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFA3E635),
                          foregroundColor: const Color(0xFF142407),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: EdgeInsets.zero,
                          elevation: 0,
                        ),
                        onPressed: () async {
                          await FlutterOverlayWindow.closeOverlay();
                        },
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(LucideIcons.externalLink, size: 14),
                            SizedBox(width: 6),
                            Text('Open CRM', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
