import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../config/constants.dart';
import '../../config/theme.dart';
import '../../services/seller_service.dart';

class SellerNewListingScreen extends StatefulWidget {
  const SellerNewListingScreen({super.key});

  @override
  State<SellerNewListingScreen> createState() => _SellerNewListingScreenState();
}

class _SellerNewListingScreenState extends State<SellerNewListingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _service = SellerService();

  // Form fields
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _shippingCtrl = TextEditingController(text: '0.00');
  final _inventoryCtrl = TextEditingController(text: '1');
  final _imageUrlCtrl = TextEditingController();
  String _category = AppConstants.categories.first;
  String _condition = AppConstants.conditions.first;
  bool _pickupAvailable = false;
  final _pickupCityCtrl = TextEditingController();
  final _pickupStateCtrl = TextEditingController();
  final _pickupPostalCtrl = TextEditingController();

  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _priceCtrl.dispose();
    _shippingCtrl.dispose();
    _inventoryCtrl.dispose();
    _imageUrlCtrl.dispose();
    _pickupCityCtrl.dispose();
    _pickupStateCtrl.dispose();
    _pickupPostalCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await _service.createListing(
        title: _titleCtrl.text.trim(),
        description: _descCtrl.text.trim(),
        priceUsd: double.parse(_priceCtrl.text.trim()),
        category: _category,
        condition: _condition,
        imageUrl: _imageUrlCtrl.text.trim(),
        shippingUsd: double.tryParse(_shippingCtrl.text.trim()) ?? 0,
        inventory: int.tryParse(_inventoryCtrl.text.trim()) ?? 1,
        pickupAvailable: _pickupAvailable,
        pickupCity: _pickupAvailable ? _pickupCityCtrl.text.trim() : null,
        pickupState: _pickupAvailable ? _pickupStateCtrl.text.trim() : null,
        pickupPostalCode: _pickupAvailable ? _pickupPostalCtrl.text.trim() : null,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Listing submitted for review!'),
          backgroundColor: AppTheme.accent,
        ),
      );
      context.pop();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Listing')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Info banner
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withAlpha(15),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.primary.withAlpha(60)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, color: AppTheme.primary, size: 18),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'New listings are reviewed before going live. Usually within 24 hours.',
                        style: TextStyle(color: AppTheme.primary, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              _SectionLabel(label: 'Listing Details'),
              TextFormField(
                controller: _titleCtrl,
                decoration: const InputDecoration(labelText: 'Title'),
                textCapitalization: TextCapitalization.words,
                validator: (v) {
                  if (v == null || v.trim().length < 3) {
                    return 'Title must be at least 3 characters';
                  }
                  return null;
                },
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
                validator: (v) {
                  if (v == null || v.trim().length < 10) {
                    return 'Description must be at least 10 characters';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),

              // Category
              DropdownButtonFormField<String>(
                value: _category,
                decoration: const InputDecoration(labelText: 'Category'),
                items: AppConstants.categories
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) => setState(() => _category = v!),
              ),
              const SizedBox(height: 14),

              // Condition
              DropdownButtonFormField<String>(
                value: _condition,
                decoration: const InputDecoration(labelText: 'Condition'),
                items: AppConstants.conditions
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) => setState(() => _condition = v!),
              ),
              const SizedBox(height: 20),

              _SectionLabel(label: 'Pricing'),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _priceCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Price (\$)',
                        prefixText: '\$',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Required';
                        final d = double.tryParse(v.trim());
                        if (d == null || d < 0) return 'Enter a valid price';
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _shippingCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Shipping (\$)',
                        prefixText: '\$',
                        hintText: '0 = free',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _inventoryCtrl,
                decoration: const InputDecoration(labelText: 'Inventory'),
                keyboardType: TextInputType.number,
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  if (n == null || n < 1) return 'Must be at least 1';
                  return null;
                },
              ),
              const SizedBox(height: 20),

              _SectionLabel(label: 'Image'),
              TextFormField(
                controller: _imageUrlCtrl,
                decoration: const InputDecoration(
                  labelText: 'Image URL',
                  hintText: 'https://…',
                  helperText: 'Paste a publicly accessible image URL.',
                ),
                keyboardType: TextInputType.url,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Image URL is required';
                  if (!v.startsWith('http')) return 'Must be a valid URL';
                  return null;
                },
              ),
              const SizedBox(height: 20),

              // Pickup
              _SectionLabel(label: 'Local Pickup'),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Offer local pickup'),
                subtitle: const Text('Buyers can pick up in person'),
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
                        decoration: const InputDecoration(labelText: 'State'),
                        maxLength: 2,
                        textCapitalization: TextCapitalization.characters,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: TextFormField(
                        controller: _pickupPostalCtrl,
                        decoration: const InputDecoration(labelText: 'ZIP Code'),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.danger.withAlpha(20),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppTheme.danger.withAlpha(80)),
                  ),
                  child: Text(_error!,
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
                    : const Text('Submit Listing'),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        label,
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 15,
          color: AppTheme.textPrimary,
        ),
      ),
    );
  }
}
