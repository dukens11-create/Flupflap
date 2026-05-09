import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/theme.dart';
import '../../services/seller_service.dart';
import '../../widgets/common_widgets.dart';

/// Seller Tax Center screen.
/// Displays a yearly tax summary, tax profile, and 1099-K status.
class SellerTaxCenterScreen extends StatefulWidget {
  const SellerTaxCenterScreen({super.key});

  @override
  State<SellerTaxCenterScreen> createState() => _SellerTaxCenterScreenState();
}

class _SellerTaxCenterScreenState extends State<SellerTaxCenterScreen> {
  final _service = SellerService();
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;
  int _selectedYear = DateTime.now().year;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _service.fetchTaxCenterData(year: _selectedYear);
      if (mounted) setState(() => _data = data);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _dollars(dynamic cents) {
    final c = (cents as num?)?.toInt() ?? 0;
    return '\$${(c / 100).toStringAsFixed(2)}';
  }

  String _form1099Label(String? status) {
    switch (status) {
      case 'NOT_ELIGIBLE':
        return 'Not eligible';
      case 'PENDING':
        return 'Pending';
      case 'AVAILABLE':
        return 'Available';
      case 'FILED':
        return 'Filed';
      default:
        return status ?? 'Unknown';
    }
  }

  Color _form1099Color(String? status) {
    switch (status) {
      case 'AVAILABLE':
      case 'FILED':
        return Colors.green.shade700;
      case 'PENDING':
        return Colors.amber.shade800;
      default:
        return Colors.grey.shade600;
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = _data?['summary'] as Map<String, dynamic>?;
    final taxProfile = _data?['taxProfile'] as Map<String, dynamic>?;
    final availableYears =
        (_data?['availableYears'] as List<dynamic>?)?.cast<int>() ??
            [DateTime.now().year];

    return Scaffold(
      appBar: AppBar(title: const Text('Tax Center')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? AppErrorBanner(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Disclaimer
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade50,
                          border: Border.all(color: Colors.amber.shade300),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '⚠️ FlupFlap does not provide tax advice. Sellers should consult a tax professional.',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.amber.shade900,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Tax Profile card
                      if (taxProfile != null) ...[
                        _SectionTitle('Seller Tax Profile'),
                        _InfoCard(children: [
                          _InfoRow(
                            'Legal Name',
                            taxProfile['legalName'] as String? ?? '—',
                          ),
                          _InfoRow(
                            'Business Name',
                            taxProfile['businessName'] as String? ?? '—',
                          ),
                          _InfoRow(
                            'Tax ID Status',
                            _taxIdStatusLabel(
                              taxProfile['taxIdStatus'] as String?,
                            ),
                          ),
                          _InfoRow(
                            'Verification',
                            taxProfile['verificationStatus'] as String? ??
                                'Not started',
                          ),
                          if (taxProfile['addressLine1'] != null)
                            _InfoRow(
                              'Address',
                              [
                                taxProfile['addressLine1'],
                                taxProfile['city'],
                                taxProfile['state'],
                                taxProfile['postalCode'],
                              ]
                                  .where((s) => s != null && s.isNotEmpty)
                                  .join(', '),
                            ),
                          _InfoRow(
                            'Stripe Connect',
                            taxProfile['stripeAccountId'] as String? ??
                                'Not connected',
                          ),
                        ]),
                        const SizedBox(height: 16),
                      ],

                      // Year selector
                      _SectionTitle('Annual Tax Summary'),
                      Row(
                        children: [
                          const Text('Tax year: ',
                              style: TextStyle(fontSize: 14)),
                          const SizedBox(width: 8),
                          DropdownButton<int>(
                            value: _selectedYear,
                            items: availableYears
                                .map(
                                  (y) => DropdownMenuItem(
                                    value: y,
                                    child: Text(
                                      y.toString(),
                                      style: const TextStyle(fontSize: 14),
                                    ),
                                  ),
                                )
                                .toList(),
                            onChanged: (y) {
                              if (y != null && y != _selectedYear) {
                                setState(() => _selectedYear = y);
                                _load();
                              }
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),

                      if (summary != null) ...[
                        _InfoCard(children: [
                          _InfoRow(
                            'Gross Sales',
                            _dollars(summary['grossSalesCents']),
                          ),
                          _InfoRow(
                            'Total Orders',
                            '${summary['totalOrders'] ?? 0}',
                          ),
                          _InfoRow(
                            'Refunds',
                            '−${_dollars(summary['refundsCents'])}',
                          ),
                          _InfoRow(
                            'FlupFlap Commission',
                            '−${_dollars(summary['marketplaceFeesCents'])}',
                          ),
                          _InfoRow(
                            'Payment Fees (est.)',
                            '−${_dollars(summary['paymentFeesCents'])}',
                          ),
                          _InfoRow(
                            'Net Payout Estimate',
                            _dollars(summary['netPayoutsCents']),
                          ),
                          _InfoRow(
                            'Sales Tax Collected',
                            _dollars(summary['salesTaxCollectedCents']),
                          ),
                        ]),
                        const SizedBox(height: 12),

                        // Download buttons — open in browser
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            OutlinedButton.icon(
                              icon: const Icon(Icons.download, size: 16),
                              label: const Text('CSV Report'),
                              onPressed: () => _openUrl(
                                '/api/seller/tax-center/csv?year=$_selectedYear',
                              ),
                            ),
                            OutlinedButton.icon(
                              icon: const Icon(Icons.picture_as_pdf, size: 16),
                              label: const Text('PDF Statement'),
                              onPressed: () => _openUrl(
                                '/api/seller/tax-center/pdf?year=$_selectedYear',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),

                        // 1099-K section
                        _SectionTitle('1099-K Tax Form'),
                        _InfoCard(children: [
                          Row(
                            children: [
                              Text(
                                'Status: ',
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: AppTheme.textSecondary,
                                ),
                              ),
                              Text(
                                _form1099Label(
                                  summary['form1099Status'] as String?,
                                ),
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: _form1099Color(
                                    summary['form1099Status'] as String?,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          _InfoRow('Tax Year', '$_selectedYear'),
                          if (summary['form1099Status'] == 'AVAILABLE' ||
                              summary['form1099Status'] == 'FILED') ...[
                            const SizedBox(height: 8),
                            if (summary['form1099DownloadUrl'] != null)
                              ElevatedButton.icon(
                                icon: const Icon(Icons.download, size: 16),
                                label: const Text('Download 1099-K'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppTheme.accent,
                                  foregroundColor: Colors.white,
                                ),
                                onPressed: () => _openUrl(
                                  summary['form1099DownloadUrl'] as String,
                                ),
                              ),
                          ],
                          const SizedBox(height: 8),
                          Text(
                            '1099-K forms are generated and filed through Stripe Connect when required.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ]),
                      ],
                    ],
                  ),
                ),
    );
  }

  String _taxIdStatusLabel(String? status) {
    switch (status) {
      case 'PROVIDED':
        return 'On file';
      case 'PENDING':
        return 'Pending verification';
      case 'NOT_PROVIDED':
        return 'Not provided';
      default:
        return status ?? 'Not provided';
    }
  }

  Future<void> _openUrl(String path) async {
    // The base URL is derived from the API client configuration
    final uri = Uri.parse('${_service.baseUrl}$path');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle(this.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
          color: AppTheme.textPrimary,
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final List<Widget> children;
  const _InfoCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.grey.shade200),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 160,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
