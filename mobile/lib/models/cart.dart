import 'product.dart';

/// Cart item (local, not persisted on server).
class CartItem {
  final Product product;
  int quantity;

  CartItem({required this.product, this.quantity = 1});

  int get subtotalCents => product.priceCents * quantity;
  int get shippingCents => product.shippingCents;
  int get totalCents => subtotalCents + shippingCents;
}

/// Local cart state.
class Cart {
  final List<CartItem> items;

  const Cart({this.items = const []});

  int get itemCount => items.fold(0, (sum, i) => sum + i.quantity);
  int get subtotalCents => items.fold(0, (sum, i) => sum + i.subtotalCents);
  int get shippingCents => items.fold(0, (sum, i) => sum + i.shippingCents);
  int get totalCents => subtotalCents + shippingCents;
}
