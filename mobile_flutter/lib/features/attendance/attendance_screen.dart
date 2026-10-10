import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/attendance_provider.dart';
import 'widgets/attendance_history_list.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  Timer? _clockTimer;
  DateTime _currentTime = DateTime.now();
  int _modeTab = 1; // 0: Team Shift Logger, 1: Personal Check-In
  int _historyTabIndex = 0; // 0: Week, 1: Month

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() => _currentTime = DateTime.now());
      }
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<AttendanceProvider>();
    final isCheckedIn = provider.isCheckedIn;
    final isCheckedOut = provider.isCheckedOut;
    final isBusy = provider.isBusy;
    final busyPhase = provider.busyPhase;

    final hoursMinutes = DateFormat('hh:mm').format(_currentTime);
    final seconds = DateFormat('ss').format(_currentTime);
    final period = DateFormat('a').format(_currentTime);
    final formattedDate = DateFormat('EEEE, MMM d, yyyy').format(_currentTime);

    final history = provider.history;
    final daysPresent = history.length;
    final completeDays = history.where((a) => a.isCheckedIn && a.isCheckedOut).length;
    final totalHoursMinutes = history.fold<int>(0, (sum, a) => sum + a.durationMinutes);
    final totalHours = (totalHoursMinutes / 60).toStringAsFixed(1);

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F1216) : const Color(0xFFF8FAFC),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.init(),
          color: AppColors.neonLime,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── 1. Top Suite Header ─────────────────────────────
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              'Attendance & Shift Suite',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: isDark ? Colors.white : const Color(0xFF0F172A),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.neonLime.withAlpha(25),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: AppColors.neonLime.withAlpha(70)),
                              ),
                              child: const Text(
                                'LIVE SYNC',
                                style: TextStyle(
                                  fontSize: 8.5,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.neonLime,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Executive CRM • Shift v3.4 Enterprise',
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF181C22) : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isDark ? const Color(0xFF2A323D) : AppColors.lightBorder,
                        ),
                      ),
                      child: const Row(
                        children: [
                          Icon(LucideIcons.mapPin, size: 11, color: Color(0xFF10B981)),
                          SizedBox(width: 4),
                          Text(
                            'Office HQ',
                            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // ── 2. Segmented Mode Switcher (Team Shift Logger vs Personal Check-In)
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF181C22) : const Color(0xFFE2E8F0),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isDark ? const Color(0xFF2A323D) : const Color(0xFFCBD5E1),
                    ),
                  ),
                  child: Row(
                    children: [
                      _buildModeButton(
                        index: 0,
                        title: 'Team Shift Logger',
                        subtitle: 'TEAM LOGGER • ADMIN',
                        isSelected: _modeTab == 0,
                        isDark: isDark,
                      ),
                      _buildModeButton(
                        index: 1,
                        title: 'Personal Check-In',
                        subtitle: 'INDIVIDUAL ATTENDANCE',
                        isSelected: _modeTab == 1,
                        isDark: isDark,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // ── 3. Tactile Hero Shift Card ──────────────────────
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: isDark
                          ? [const Color(0xFF181C22), const Color(0xFF12161C)]
                          : [Colors.white, const Color(0xFFF1F5F9)],
                    ),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: isDark ? const Color(0xFF2A323D) : AppColors.lightBorder,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withAlpha(isDark ? 80 : 15),
                        blurRadius: 20,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      // Date & GPS Verified Bar
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(LucideIcons.calendar, size: 12, color: AppColors.neonLime),
                                  const SizedBox(width: 5),
                                  Text(
                                    formattedDate,
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 3),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                    decoration: BoxDecoration(
                                      color: isDark ? const Color(0xFF222831) : const Color(0xFFE2E8F0),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text(
                                      'SHIFT',
                                      style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    '12:00 PM – 08:00 PM (8h)',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: isDark ? Colors.white : Colors.black,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981).withAlpha(20),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFF10B981).withAlpha(60)),
                            ),
                            child: const Row(
                              children: [
                                Icon(LucideIcons.mapPin, size: 10, color: Color(0xFF10B981)),
                                SizedBox(width: 4),
                                Text(
                                  'GPS Verified',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF10B981),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Monospace Large Digital Clock
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            hoursMinutes,
                            style: TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 44,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -1,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ),
                          const Text(
                            ':',
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w300,
                              color: AppColors.neonLime,
                            ),
                          ),
                          Container(
                            margin: const EdgeInsets.symmetric(horizontal: 4),
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF222831) : const Color(0xFFE2E8F0),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              seconds,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: AppColors.neonLime,
                              ),
                            ),
                          ),
                          Text(
                            period,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppColors.neonLime,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            'Server UTC+03:00 • 18ms Ping',
                            style: TextStyle(
                              fontSize: 10,
                              color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),

                      // Big Tactile Check-In Button
                      SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: isCheckedOut
                                ? (isDark ? const Color(0xFF222831) : const Color(0xFFCBD5E1))
                                : (isCheckedIn ? const Color(0xFFEF4444) : AppColors.neonLime),
                            foregroundColor: isCheckedIn ? Colors.white : const Color(0xFF0F172A),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                            elevation: isCheckedOut ? 0 : 6,
                            shadowColor: isCheckedIn
                                ? const Color(0xFFEF4444).withAlpha(120)
                                : AppColors.neonLime.withAlpha(150),
                          ),
                          onPressed: isBusy || isCheckedOut
                              ? null
                              : () async {
                                  if (!isCheckedIn) {
                                    await provider.checkIn();
                                  } else {
                                    await provider.checkOut();
                                  }
                                },
                          child: isBusy
                              ? Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    ),
                                    const SizedBox(width: 10),
                                    Text(
                                      busyPhase.isNotEmpty ? busyPhase : 'Verifying GPS...',
                                      style: const TextStyle(fontWeight: FontWeight.w700),
                                    ),
                                  ],
                                )
                              : Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Container(
                                      width: 38,
                                      height: 38,
                                      decoration: BoxDecoration(
                                        color: Colors.black.withAlpha(20),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Icon(
                                        isCheckedOut
                                            ? LucideIcons.circleCheck
                                            : (isCheckedIn ? LucideIcons.logOut : LucideIcons.fingerprint),
                                        size: 20,
                                        color: isCheckedIn ? Colors.white : Colors.black,
                                      ),
                                    ),
                                    Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          isCheckedOut
                                              ? 'SHIFT COMPLETED'
                                              : (isCheckedIn ? 'CLOCK OUT' : 'INSTANT BIOMETRIC CHECK-IN'),
                                          style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: 0.3,
                                            color: isCheckedIn ? Colors.white : Colors.black,
                                          ),
                                        ),
                                        Text(
                                          isCheckedOut
                                              ? 'Shift recorded'
                                              : 'ONE-TAP NFC & GPS AUTHENTICATION',
                                          style: TextStyle(
                                            fontSize: 9,
                                            fontWeight: FontWeight.w700,
                                            color: isCheckedIn ? Colors.white70 : Colors.black87,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const Icon(LucideIcons.arrowRight, size: 18),
                                  ],
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // ── 4. Performance Metrics Strip (Hours, Punctual, Balance)
                Row(
                  children: [
                    Expanded(
                      child: _buildMetricTile(
                        label: 'HOURS',
                        value: provider.durationString ?? (isCheckedIn ? 'In shift' : '00h 00m'),
                        target: 'Target: 8.0h',
                        targetColor: const Color(0xFF10B981),
                        icon: LucideIcons.clock,
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildMetricTile(
                        label: 'PUNCTUAL',
                        value: '0m Delay',
                        target: '100% On Time',
                        targetColor: AppColors.neonLime,
                        icon: LucideIcons.zap,
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildMetricTile(
                        label: 'BALANCE',
                        value: '18.5 d',
                        target: 'Annual Paid',
                        targetColor: const Color(0xFF38BDF8),
                        icon: LucideIcons.badgeCheck,
                        isDark: isDark,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // ── 5. Weekly Shift & Attendance Log ─────────────────
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF181C22) : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isDark ? const Color(0xFF2A323D) : AppColors.lightBorder,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    'Weekly Shift Log',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w800,
                                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                    decoration: BoxDecoration(
                                      color: AppColors.neonLime.withAlpha(25),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      'Week 39',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.neonLime,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Attendance Analytics & Compliance',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                                ),
                              ),
                            ],
                          ),
                          // Week / Month toggle
                          Container(
                            padding: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF12161C) : const Color(0xFFE2E8F0),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                _buildMiniTab('Week', 0, isDark),
                                _buildMiniTab('Month', 1, isDark),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Shift Target Progress bar
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF222831) : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'Shift Target Progress',
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                                ),
                                Text(
                                  '${totalHours}h / 40.0h (81%)',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.neonLime,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: const LinearProgressIndicator(
                                value: 0.81,
                                backgroundColor: Color(0xFF12161C),
                                valueColor: AlwaysStoppedAnimation<Color>(AppColors.neonLime),
                                minHeight: 6,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Summary Stats Row: Days present, Complete days, Total hours
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _buildStatColumn('Present', '$daysPresent days', AppColors.neonLime),
                          _buildStatColumn('Completed', '$completeDays days', const Color(0xFF10B981)),
                          _buildStatColumn('Logged', '${totalHours}h', const Color(0xFF38BDF8)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // ── 6. History List ──────────────────────────────────
                AttendanceHistoryList(history: provider.history),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildModeButton({
    required int index,
    required String title,
    required String subtitle,
    required bool isSelected,
    required bool isDark,
  }) {
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _modeTab = index),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.neonLime : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: isSelected ? const Color(0xFF0F172A) : (isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B)),
                ),
              ),
              const SizedBox(height: 1),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w700,
                  color: isSelected ? const Color(0xFF0F172A).withAlpha(180) : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricTile({
    required String label,
    required String value,
    required String target,
    required Color targetColor,
    required IconData icon,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF181C22) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? const Color(0xFF2A323D) : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                ),
              ),
              Icon(icon, size: 12, color: targetColor),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: isDark ? Colors.white : Colors.black,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            target,
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w600,
              color: targetColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniTab(String label, int index, bool isDark) {
    final isSelected = _historyTabIndex == index;
    return InkWell(
      onTap: () => setState(() => _historyTabIndex = index),
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.neonLime : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
            color: isSelected ? const Color(0xFF0F172A) : (isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B)),
          ),
        ),
      ),
    );
  }

  Widget _buildStatColumn(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: Color(0xFF8B949E)),
        ),
      ],
    );
  }
}
