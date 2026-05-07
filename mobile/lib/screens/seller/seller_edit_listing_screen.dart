import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../config/constants.dart';
import '../../config/theme.dart';
import '../../models/product.dart';
import '../../services/product_service.dart';
import '../../services/seller_service.dart';
import '../../widgets/common_widgets.dart';

class SellerEditListingScreen extends StatefulWidget {
  final String productId;
  const SellerEditListingScreen({super.key, required this.productId});

  @override
  State<SellerEditListingScreen> createState() =>
      _SellerEditListingScreenState();
}

class _SellerEditListingScreenState extends State<SellerEditListingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _productService = ProductService();
  final _sellerService = SellerService();

  Product? _product;
  bool _loading = true;
  String? _error;

  // Form controllers (populated after loading)
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _shippingCtrl = TextEditingController();
  final _inventoryCtrl = TextEditingController();
  String? _category;
  String? _condition;
  bool _pickupAvailable = false;
  final _pickupCityCtrl = TextEditingController();
  final _pickupStateCtrl = TextEditingController();
  final _pickupPostalCtrl = TextEditingController();

  bool _submitting = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _loadProduct();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _priceCtrl.dispose();
    _shippingCtrl.dispose();
    _inventoryCtrl.dispose();
    _pickupCityCtrl.dispose();
    _pickupStateCtrl.dispose();
    _pickupPostalCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadProduct() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final p = await _productService.fetchProduct(widget.productId);
      if (mounted) {
        _product = p;
        _titleCtrl.text = p.title;
        _descCtrl.text = p.description;
        _priceCtrl.text = p.priceUsd.toStringAsFixed(2);
        _shippingCtrl.text = p.shippingUsd.toStringAsFixed(2);
        _inventoryCtrl.text = p.inventory.toString();
        _category = p.category;
        _condition = p.condition;
        _pickupAvailable = p.pickupAvailable;
        _pickupCityCtrl.text = p.pickupCity ?? '';
        _pickupStateCtrl.text = p.pickupState ?? '';
        _pickupPostalCtrl.text = p.pickupPostalCode ?? '';
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      await _sellerService.updateListing(widget.productId, {
        'title': _titleCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'price': _priceCtrl.text.trim(),
        'category': _category,
        'condition': _condition,
        'shipping': _shippingCtrl.text.trim(),
        'inventory': _inventoryCtrl.text.trim(),
        'pickupAvailable': _pickupAvailable ? 'true' : 'false',
        if (_pickupAvailable) 'pickupCity': _pickupCityCtrl.text.trim(),
        if (_pickupAvailable) 'pickupState': _pickupStateCtrl.text.trim(),
        if (_pickupAvailable) 'pickupPostalCode': _pickupPostalCtrl.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Listing updated!'),
          backgroundColor: AppTheme.accent,
        ),
      );
      context.pop();
    } catch (e) {
      if (mounted) setState(() => _submitError = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Listing')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? AppErrorBanner(message: _error!, onRetry: _loadProduct)
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextFormField(
                          controller: _titleCtrl,
                          decoration: const InputDecoration(labelText: 'Title'),
                          textCapitalization: TextCapitalization.words,
                          validator: (v) => (v == null || v.trim().length < 3)
                              ? 'Title must be at least 3 characters'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _descCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Description',
                            alignLabelWithHint: true,
                          ),
                          maxLines: 4,
                          textCapitalization: TextCapitalization.sentences,
                          validator: (v) => (v == null || v.trim().length < 10)
                              ? 'Description must be at least 10 characters'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        DropdownButtonFormField<String>(
                          value: _category,
                          decoration: const InputDecoration(labelText: 'Category'),
                          items: AppConstants.categories
                              .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                              .toList(),
                          onChanged: (v) => setState(() => _category = v),
                        ),
                        const SizedBox(height: 14),
                        DropdownButtonFormField<String>(
                          value: _condition,
                          decoration: const InputDecoration(labelText: 'Condition'),
                          items: AppConstants.conditions
                              .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                              .toList(),
                          onChanged: (v) => setState(() => _condition = v),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: _priceCtrl,
                                decoration: const InputDecoration(
                                    labelText: 'Price (\$)', prefixText: '\$'),
                                keyboardType: const TextInputType.numberWithOptions(
                                    decimal: true),
                                validator: (v) {
                                  final d = double.tryParse(v ?? '');
                                  if (d == null || d < 0) {
                                    return 'Enter a valid price';
                                  }
                                  return null;
                                },
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: TextFormField(
                                controller: _shippingCtrl,
                                decoration: const InputDecoration(
                                    labelText: 'Shipping (\$)', prefixText: '\$'),
                                keyboardType: const TextInputType.numberWithOptions(
                                    decimal: true),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _inventoryCtrl,
                          decoration: const InputDecoration(labelText: 'Inventory'),
                          keyboardType: TextInputType.number,
                        ),
                        const SizedBox(height: 16),
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Local Pickup Available'),
                          value: _pickupAvailable,
                          activeColor: AppTheme.primary,
                          onChanged: (v) => setState(() => _pickupAvailable = v),
                        ),
                        if (_pickupAvailable) ...[
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _pickupCityCtrl,
                            decoration: const InputDecoration(labelText: 'City'),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                flex: 1,
                                child: TextFormField(
                                  controller: _pickupStateCtrl,
                                  decoration:
                                      const InputDecoration(labelText: 'State'),
                                  maxLength: 2,
                                  textCapitalization:
                                      TextCapitalization.characters,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                flex: 2,
                                child: TextFormField(
                                  controller: _pickupPostalCtrl,
                                  decoration:
                                      const InputDecoration(labelText: 'ZIP'),
                                  keyboardType: TextInputType.number,
                                ),
                              ),
                            ],
                          ),
                        ],
                        if (_submitError != null) ...[
                          const SizedBox(height: 16),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppTheme.danger.withAlpha(20),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: AppTheme.danger.withAlpha(80)),
                            ),
                            child: Text(_submitError!,
                                style: const TextStyle(color: AppTheme.danger)),
                          ),
                        ],
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: _submitting ? null : _submit,
                          child: _submitting
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text('Save Changes'),
                        ),
                        const SizedBox(height: 32),
                      ],
                    ),
                  ),
                ),
    );
  }
}
