/// User model mirroring the FlupFlap backend User schema.
class AppUser {
  final String id;
  final String name;
  final String email;
  final String role; // CUSTOMER | SELLER | ADMIN
  final String? phone;
  final bool phoneVerified;
  final String? image;
  final String? subscriptionStatus; // ACTIVE | INACTIVE | PAST_DUE | CANCELLED
  final DateTime? subscriptionCurrentPeriodEnd;
  final bool stripeOnboardingComplete;
  final String sellerStatus; // ACTIVE | SUSPENDED | BANNED
  final String? sellerStatusReason;

  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.phone,
    this.phoneVerified = false,
    this.image,
    this.subscriptionStatus,
    this.subscriptionCurrentPeriodEnd,
    this.stripeOnboardingComplete = false,
    this.sellerStatus = 'ACTIVE',
    this.sellerStatusReason,
  });

  bool get isSeller => role == 'SELLER';
  bool get isAdmin => role == 'ADMIN';

  bool get hasActiveSubscription {
    if (subscriptionStatus != 'ACTIVE' && subscriptionStatus != 'PAST_DUE') {
      return false;
    }
    if (subscriptionCurrentPeriodEnd == null) return false;
    return subscriptionCurrentPeriodEnd!.isAfter(DateTime.now());
  }

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      role: json['role'] as String? ?? 'CUSTOMER',
      phone: json['phone'] as String?,
      phoneVerified: json['phoneVerified'] as bool? ?? false,
      image: json['image'] as String?,
      subscriptionStatus: json['subscriptionStatus'] as String?,
      subscriptionCurrentPeriodEnd: json['subscriptionCurrentPeriodEnd'] != null
          ? DateTime.tryParse(json['subscriptionCurrentPeriodEnd'] as String)
          : null,
      stripeOnboardingComplete: json['stripeOnboardingComplete'] as bool? ?? false,
      sellerStatus: json['sellerStatus'] as String? ?? 'ACTIVE',
      sellerStatusReason: json['sellerStatusReason'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'role': role,
        'phone': phone,
        'phoneVerified': phoneVerified,
        'image': image,
        'subscriptionStatus': subscriptionStatus,
        'subscriptionCurrentPeriodEnd': subscriptionCurrentPeriodEnd?.toIso8601String(),
        'stripeOnboardingComplete': stripeOnboardingComplete,
        'sellerStatus': sellerStatus,
        'sellerStatusReason': sellerStatusReason,
      };
}
