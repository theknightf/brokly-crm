import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/widgets/premium.dart';
import '../../../state/attendance_provider.dart';
import '../../../state/auth_provider.dart';
import 'dash_kit.dart';

/// Greeting + attendance chip. Only rebuilds when name / check-in changes.
class DashboardHeader extends StatelessWidget {
  final VoidCallback? onAttendanceTap;
  const DashboardHeader({super.key, this.onAttendanceTap});

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    final name = context.select<AuthProvider, String>((a) {
      final p = a.profile;
      if (p != null && p.fullName.trim().isNotEmpty) {
        return p.fullName.trim().split(' ').first;
      }
      return a.user?.email?.split('@').first ?? 'Agent';
    });
    final checkedIn =
        context.select<AttendanceProvider, bool>((a) => a.isCheckedIn);
    final accent = Surf.accent(context);
    final dark = Surf.dark(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${_greeting()}, $name',
                style: TextStyle(
                  fontSize: 22,
                  height: 1.15,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: Surf.text(context),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Here is your real-time brokerage workspace',
                style: TextStyle(fontSize: 13, color: Surf.subtext(context)),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Semantics(
          button: true,
          label: checkedIn ? 'Checked in' : 'Check in',
          child: InkWell(
            onTap: onAttendanceTap,
            borderRadius: BorderRadius.circular(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: checkedIn
                      ? accent.withAlpha(dark ? 34 : 24)
                      : Surf.card(context),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: checkedIn
                        ? accent.withAlpha(120)
                        : Surf.border(context),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: checkedIn ? accent : DashColors.slate,
                      ),
                    ),
                    const SizedBox(width: 7),
                    Text(
                      checkedIn ? 'Checked In' : 'Check In',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: checkedIn ? accent : Surf.subtext(context),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Pulsing placeholder shown on first load instead of a spinner.
class DashboardSkeleton extends StatefulWidget {
  const DashboardSkeleton({super.key});

  @override
  State<DashboardSkeleton> createState() => _DashboardSkeletonState();
}

class _DashboardSkeletonState extends State<DashboardSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1100))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _block(BuildContext context, double h, {double? w, double r = 18}) {
    return Container(
      height: h,
      width: w,
      decoration: BoxDecoration(
        color: Surf.muted(context),
        borderRadius: BorderRadius.circular(r),
        border: Border.all(color: Surf.border(context)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1)
          .animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
        children: [
          _block(context, 44, w: 220, r: 12),
          const SizedBox(height: 18),
          Row(children: [
            Expanded(child: _block(context, 98)),
            const SizedBox(width: 10),
            Expanded(child: _block(context, 98)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _block(context, 98)),
            const SizedBox(width: 10),
            Expanded(child: _block(context, 98)),
          ]),
          const SizedBox(height: 16),
          _block(context, 150),
          const SizedBox(height: 16),
          _block(context, 240),
          const SizedBox(height: 16),
          _block(context, 180),
        ],
      ),
    );
  }
}

/// Inline error card with retry (used when the summary fails to load).
class DashboardError extends StatelessWidget {
  final VoidCallback onRetry;
  const DashboardError({super.key, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      margin: EdgeInsets.zero,
      child: ErrorState(
        message:
            'Could not load your dashboard summary. Pull down or tap retry.',
        onRetry: onRetry,
      ),
    );
  }
}
