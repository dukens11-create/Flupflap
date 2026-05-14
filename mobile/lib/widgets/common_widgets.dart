import 'package:flutter/material.dart';
import '../config/theme.dart';

class AppLoadingOverlay extends StatelessWidget {
  final bool loading;
  final Widget child;
  final String? message;

  const AppLoadingOverlay({
    super.key,
    required this.loading,
    required this.child,
    this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (loading)
          Container(
            color: Colors.black.withAlpha(100),
            child: Center(
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      if (message != null) ...[
                        const SizedBox(height: 12),
                        Text(message!, style: const TextStyle(color: AppTheme.textSecondary)),
                      ],
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

class AppErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const AppErrorBanner({super.key, required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.danger.withAlpha(20),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.danger.withAlpha(80)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppTheme.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: AppTheme.danger, fontSize: 13),
            ),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
        ],
      ),
    );
  }
}

class AppEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: AppTheme.border),
            const SizedBox(height: 16),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                style: const TextStyle(color: AppTheme.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: 20),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Badge showing order status with appropriate color.
class OrderStatusBadge extends StatelessWidget {
  final String status;
  const OrderStatusBadge({super.key, required this.status});

  Color get _color {
    switch (status) {
      case 'PAID':
        return AppTheme.logoGreen;
      case 'SHIPPED':
        return AppTheme.primary;
      case 'DELIVERED':
      case 'PICKED_UP':
        return const Color(0xFF059669);
      case 'CANCELLED':
      case 'REFUNDED':
        return AppTheme.danger;
      case 'PENDING':
        return AppTheme.warning;
      default:
        return AppTheme.textSecondary;
    }
  }

  String get _label {
    switch (status) {
      case 'PAID':
        return 'Paid';
      case 'SHIPPED':
        return 'Shipped';
      case 'DELIVERED':
        return 'Delivered';
      case 'PICKED_UP':
        return 'Picked Up';
      case 'CANCELLED':
        return 'Cancelled';
      case 'REFUNDED':
        return 'Refunded';
      case 'READY_FOR_PICKUP':
        return 'Ready for Pickup';
      case 'PENDING':
        return 'Pending';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _color.withAlpha(30),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _color.withAlpha(80)),
      ),
      child: Text(
        _label,
        style: TextStyle(
          color: _color,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}
