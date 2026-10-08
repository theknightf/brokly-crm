import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/leads_provider.dart';
import '../leads/lead_detail_screen.dart';
import '../leads/widgets/lead_card.dart';

class CustomersScreen extends StatelessWidget {
  const CustomersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<LeadsProvider>();
    final customers = provider.leads
        .where((l) => l.status == 'Done Deal' || l.status == 'Reservation' || l.status == 'Won')
        .toList();

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Customers',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Clients with closed deals and active reservations',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: customers.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            LucideIcons.userCheck,
                            size: 44,
                            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No converted customers yet',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Leads marked as Done Deal or Reservation will appear here',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                            ),
                          ),
                        ],
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: customers.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final customer = customers[index];
                        return LeadCard(
                          lead: customer,
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => LeadDetailScreen(leadId: customer.id),
                              ),
                            );
                          },
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
