import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/product.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';
import '../../services/product_service.dart';
import '../../widgets/product_card.dart';
import '../../widgets/common_widgets.dart';

// ---------------------------------------------------------------------------
// Curated home-page category chips (independent of AppConstants.categories)
// ---------------------------------------------------------------------------

class _HomeCat {
  final String label;
  final IconData icon;
  final String? filterValue; // null = "All"
  const _HomeCat({required this.label, required this.icon, this.filterValue});
}

const List<_HomeCat> _kHomeCategories = [
  _HomeCat(label: 'All', icon: Icons.grid_view_rounded),
  _HomeCat(
      label: 'Fashion',
      icon: Icons.checkroom_outlined,
      filterValue: 'Clothing'),
  _HomeCat(
      label: 'Electronics',
      icon: Icons.devices_outlined,
      filterValue: 'Electronics'),
  _HomeCat(
      label: 'Perfume',
      icon: Icons.spa_outlined,
      filterValue: 'Other'),
  _HomeCat(
      label: 'Caribbean',
      icon: Icons.beach_access,
      filterValue: 'Caribbean Products'),
  _HomeCat(
      label: 'African',
      icon: Icons.public_outlined,
      filterValue: 'African Products'),
  _HomeCat(
      label: 'Asian',
      icon: Icons.travel_explore,
      filterValue: 'Asian Products'),
  _HomeCat(
      label: 'Beauty',
      icon: Icons.face_retouching_natural,
      filterValue: 'Beauty'),
  _HomeCat(
      label: 'Home',
      icon: Icons.home_outlined,
      filterValue: 'Furniture'),
];

// ---------------------------------------------------------------------------
// Trust badge data
// ---------------------------------------------------------------------------

class _TrustBadge {
  final IconData icon;
  final String label;
  final Color color;
  const _TrustBadge(
      {required this.icon, required this.label, required this.color});
}

const List<_TrustBadge> _kTrustBadges = [
  _TrustBadge(
      icon: Icons.verified_user_outlined,
      label: 'Verified\nSellers',
      color: AppTheme.logoGreen),
  _TrustBadge(
      icon: Icons.lock_outlined,
      label: 'Secure\nPayments',
      color: Color(0xFF3B82F6)),
  _TrustBadge(
      icon: Icons.shield_outlined,
      label: 'Buyer\nProtection',
      color: Color(0xFF8B5CF6)),
  _TrustBadge(
      icon: Icons.local_shipping_outlined,
      label: 'Fast\nShipping',
      color: AppTheme.accent),
];

// ---------------------------------------------------------------------------
// HomeScreen
// ---------------------------------------------------------------------------

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _searchCtrl = TextEditingController();
  String? _selectedCategory;
  String? _selectedCondition;
  List<Product> _products = [];
  bool _loading = true;
  String? _error;
  final _productService = ProductService();

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  bool get _isFiltered =>
      _searchCtrl.text.trim().isNotEmpty ||
      _selectedCategory != null ||
      _selectedCondition != null;

  // Derived sections from the fetched product list
  List<Product> get _trendingProducts => _products.take(8).toList();

  List<Product> get _flashDeals {
    final featured =
        _products.where((p) => p.isFeatured).take(8).toList();
    return featured;
  }

  Future<void> _loadProducts() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final products = await _productService.fetchProducts(
        query:
            _searchCtrl.text.trim().isEmpty ? null : _searchCtrl.text.trim(),
        category: _selectedCategory,
        condition: _selectedCondition,
      );
      if (mounted) setState(() => _products = products);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── App Bar ──────────────────────────────────────────────────────────────

  PreferredSizeWidget _buildAppBar(int cartCount, bool isSeller) {
    return AppBar(
      titleSpacing: 16,
      title: RichText(
        text: const TextSpan(
          children: [
            TextSpan(
              text: 'Flup',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 21,
                letterSpacing: -0.3,
              ),
            ),
            TextSpan(
              text: 'Flap',
              style: TextStyle(
                color: AppTheme.accent,
                fontWeight: FontWeight.w900,
                fontSize: 21,
                letterSpacing: -0.3,
              ),
            ),
          ],
        ),
      ),
      actions: [
        if (isSeller)
          IconButton(
            icon: const Icon(Icons.storefront_outlined),
            tooltip: 'Seller Dashboard',
            onPressed: () => context.push('/seller'),
          ),
        IconButton(
          icon: const Icon(Icons.notifications_outlined),
          tooltip: 'Activity',
          onPressed: () => context.go('/orders'),
        ),
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart_outlined),
                tooltip: 'Cart',
                onPressed: () => context.go('/cart'),
              ),
              if (cartCount > 0)
                Positioned(
                  right: 4,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(
                      color: AppTheme.accent,
                      shape: BoxShape.circle,
                    ),
                    constraints:
                        const BoxConstraints(minWidth: 16, minHeight: 16),
                    child: Text(
                      cartCount > 99 ? '99+' : '$cartCount',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Search section ────────────────────────────────────────────────────────

  Widget _buildSearchSection() {
    return Container(
      color: AppTheme.primary,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 46,
              child: TextField(
                controller: _searchCtrl,
                textAlignVertical: TextAlignVertical.center,
                decoration: InputDecoration(
                  hintText: 'Search for anything…',
                  hintStyle: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 14,
                  ),
                  prefixIcon: const Icon(
                    Icons.search,
                    color: AppTheme.textSecondary,
                    size: 20,
                  ),
                  suffixIcon: _searchCtrl.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () {
                            _searchCtrl.clear();
                            _loadProducts();
                          },
                        )
                      : null,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 0,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: AppTheme.accent,
                      width: 2,
                    ),
                  ),
                  filled: true,
                  fillColor: Colors.white,
                ),
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _loadProducts(),
                onChanged: (_) => setState(() {}),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Orange search CTA button
          Material(
            color: AppTheme.accent,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: _loadProducts,
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 46,
                height: 46,
                child: Icon(Icons.search, color: Colors.white, size: 22),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Category chips ────────────────────────────────────────────────────────

  Widget _buildCategoryChips() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: SizedBox(
        height: 40,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: _kHomeCategories.length,
          itemBuilder: (_, i) {
            final cat = _kHomeCategories[i];
            // "All" chip is selected when _selectedCategory is null
            final isSelected = cat.filterValue == null
                ? _selectedCategory == null
                : _selectedCategory == cat.filterValue;
            return _CategoryChipItem(
              icon: cat.icon,
              label: cat.label,
              selected: isSelected,
              onTap: () {
                setState(() => _selectedCategory = cat.filterValue);
                _loadProducts();
              },
            );
          },
        ),
      ),
    );
  }

  // ── Condition filter ──────────────────────────────────────────────────────

  Widget _buildConditionFilter() {
    final conditions = ['Any', 'New', 'Like new', 'Good', 'Fair', 'Used'];
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.only(bottom: 10),
      child: SizedBox(
        height: 36,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: conditions.length,
          itemBuilder: (_, i) {
            final cond = conditions[i];
            final isAny = cond == 'Any';
            final isSelected =
                isAny ? _selectedCondition == null : _selectedCondition == cond;
            return GestureDetector(
              onTap: () {
                setState(
                    () => _selectedCondition = isAny ? null : cond);
                _loadProducts();
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.only(right: 8),
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 0),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppTheme.primary.withAlpha(15)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: isSelected
                        ? AppTheme.primary
                        : AppTheme.border,
                  ),
                ),
                child: Text(
                  cond,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected
                        ? FontWeight.w700
                        : FontWeight.w500,
                    color: isSelected
                        ? AppTheme.primary
                        : AppTheme.textSecondary,
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  // ── Trust badges ──────────────────────────────────────────────────────────

  Widget _buildTrustBadges() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0C000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: _kTrustBadges
            .map((b) => _TrustBadgeItem(badge: b))
            .toList(),
      ),
    );
  }

  // ── Section header ────────────────────────────────────────────────────────

  Widget _buildSectionHeader(String title,
      {String? seeAllLabel, VoidCallback? onSeeAll}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
      child: Row(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 17,
              color: AppTheme.textPrimary,
            ),
          ),
          const Spacer(),
          if (onSeeAll != null)
            GestureDetector(
              onTap: onSeeAll,
              child: Text(
                seeAllLabel ?? 'See all',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.accent,
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ── Horizontal product section ────────────────────────────────────────────

  Widget _buildHorizontalSection(
    String title,
    List<Product> products, {
    bool showDealBadge = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(title),
        SizedBox(
          height: 220,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: products.length,
            itemBuilder: (_, i) => _SectionCard(
              product: products[i],
              showDealBadge: showDealBadge,
            ),
          ),
        ),
      ],
    );
  }

  // ── Main build ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final cartCount = context.watch<CartProvider>().itemCount;
    final user = context.watch<AuthProvider>().user;
    final isSeller = user?.isSeller == true;

    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: _buildAppBar(cartCount, isSeller),
      body: RefreshIndicator(
        onRefresh: _loadProducts,
        color: AppTheme.accent,
        backgroundColor: Colors.white,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // Search bar (inside body, below nav-colored AppBar)
            SliverToBoxAdapter(child: _buildSearchSection()),

            // Thin white divider between search and chips
            const SliverToBoxAdapter(
              child: SizedBox(height: 1),
            ),

            // Category chips
            SliverToBoxAdapter(child: _buildCategoryChips()),

            // Condition filter
            SliverToBoxAdapter(child: _buildConditionFilter()),

            // ── Content ────────────────────────────────────────────────
            if (_loading)
              const SliverFillRemaining(
                child: Center(
                  child:
                      CircularProgressIndicator(color: AppTheme.primary),
                ),
              )
            else if (_error != null) ...[
              SliverToBoxAdapter(
                child: AppErrorBanner(
                    message: _error!, onRetry: _loadProducts),
              ),
              const SliverFillRemaining(
                  hasScrollBody: false, child: SizedBox()),
            ] else if (_products.isEmpty)
              SliverFillRemaining(
                child: AppEmptyState(
                  icon: Icons.search_off_rounded,
                  title: 'No products found',
                  subtitle: 'Try adjusting your search or filters.',
                ),
              )
            else if (_isFiltered) ...[
              // Filtered results view
              SliverToBoxAdapter(
                child: _buildSectionHeader(
                  '${_products.length} result${_products.length == 1 ? '' : 's'}',
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                sliver: SliverGrid(
                  delegate: SliverChildBuilderDelegate(
                    (_, i) => ProductCard(product: _products[i]),
                    childCount: _products.length,
                  ),
                  gridDelegate:
                      const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.65,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                ),
              ),
            ] else ...[
              // Discovery home view

              // Trust badges
              SliverToBoxAdapter(child: _buildTrustBadges()),

              // Trending Now section
              if (_trendingProducts.isNotEmpty)
                SliverToBoxAdapter(
                  child: _buildHorizontalSection(
                    '🔥 Trending Now',
                    _trendingProducts,
                  ),
                ),

              // Flash Deals section (featured products only)
              if (_flashDeals.isNotEmpty)
                SliverToBoxAdapter(
                  child: _buildHorizontalSection(
                    '⚡ Flash Deals',
                    _flashDeals,
                    showDealBadge: true,
                  ),
                ),

              // All Products grid
              SliverToBoxAdapter(
                child: _buildSectionHeader('All Products'),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                sliver: SliverGrid(
                  delegate: SliverChildBuilderDelegate(
                    (_, i) => ProductCard(product: _products[i]),
                    childCount: _products.length,
                  ),
                  gridDelegate:
                      const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.65,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// _CategoryChipItem — animated pill chip with icon + label
// ---------------------------------------------------------------------------

class _CategoryChipItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _CategoryChipItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 0),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppTheme.primary : AppTheme.border,
          ),
          boxShadow: selected
              ? []
              : [
                  const BoxShadow(
                    color: Color(0x0A000000),
                    blurRadius: 4,
                    offset: Offset(0, 1),
                  ),
                ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 15,
              color: selected ? Colors.white : AppTheme.textSecondary,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight:
                    selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? Colors.white : AppTheme.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// _TrustBadgeItem
// ---------------------------------------------------------------------------

class _TrustBadgeItem extends StatelessWidget {
  final _TrustBadge badge;
  const _TrustBadgeItem({required this.badge});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: badge.color.withAlpha(25),
            shape: BoxShape.circle,
          ),
          child: Icon(badge.icon, color: badge.color, size: 20),
        ),
        const SizedBox(height: 6),
        Text(
          badge.label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: AppTheme.textPrimary,
            height: 1.3,
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// _SectionCard — horizontal scrollable product card for discover sections
// ---------------------------------------------------------------------------

class _SectionCard extends StatefulWidget {
  final Product product;
  final bool showDealBadge;
  const _SectionCard({required this.product, this.showDealBadge = false});

  @override
  State<_SectionCard> createState() => _SectionCardState();
}

class _SectionCardState extends State<_SectionCard> {
  double _scale = 1.0;

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    return GestureDetector(
      onTapDown: (_) => setState(() => _scale = 0.96),
      onTapUp: (_) {
        setState(() => _scale = 1.0);
        context.push('/products/${product.id}');
      },
      onTapCancel: () => setState(() => _scale = 1.0),
      child: AnimatedScale(
        scale: _scale,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: Container(
          width: 150,
          margin: const EdgeInsets.only(right: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: const [
              BoxShadow(
                color: Color(0x14000000),
                blurRadius: 8,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Image
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(14)),
                child: AspectRatio(
                  aspectRatio: 1,
                  child: Stack(
                    children: [
                      CachedNetworkImage(
                        imageUrl: product.imageUrl,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: double.infinity,
                        placeholder: (_, __) => const ColoredBox(
                          color: Color(0xFFF1F5F9),
                        ),
                        errorWidget: (_, __, ___) => const ColoredBox(
                          color: Color(0xFFF1F5F9),
                          child: Center(
                            child: Icon(
                              Icons.image_not_supported_outlined,
                              color: AppTheme.textSecondary,
                              size: 24,
                            ),
                          ),
                        ),
                      ),
                      if (widget.showDealBadge)
                        Positioned(
                          top: 8,
                          left: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppTheme.danger,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Text(
                              'DEAL',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ),
                      if (product.isFeatured && !widget.showDealBadge)
                        Positioned(
                          top: 8,
                          left: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppTheme.accent,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Text(
                              '★',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              // Info
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                          color: AppTheme.textPrimary,
                          height: 1.3,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        '\$${product.priceUsd.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          color: AppTheme.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
