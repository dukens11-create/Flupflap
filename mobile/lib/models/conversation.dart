/// Messaging models — mirror Conversation/Message backend schema.
class Conversation {
  final String id;
  final String buyerId;
  final String sellerId;
  final String productId;
  final String? productTitle;
  final String? productImageUrl;
  final String? otherPartyName;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final DateTime createdAt;

  const Conversation({
    required this.id,
    required this.buyerId,
    required this.sellerId,
    required this.productId,
    this.productTitle,
    this.productImageUrl,
    this.otherPartyName,
    this.lastMessage,
    this.lastMessageAt,
    required this.createdAt,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final product = json['product'] as Map<String, dynamic>?;
    final buyer = json['buyer'] as Map<String, dynamic>?;
    final seller = json['seller'] as Map<String, dynamic>?;
    final msgs = json['messages'] as List<dynamic>?;
    final lastMsg = msgs != null && msgs.isNotEmpty
        ? msgs.last as Map<String, dynamic>
        : null;
    return Conversation(
      id: json['id'] as String,
      buyerId: json['buyerId'] as String,
      sellerId: json['sellerId'] as String,
      productId: json['productId'] as String,
      productTitle: product?['title'] as String?,
      productImageUrl: product?['imageUrl'] as String?,
      otherPartyName: buyer?['name'] as String? ?? seller?['name'] as String?,
      lastMessage: lastMsg?['body'] as String?,
      lastMessageAt: lastMsg != null
          ? DateTime.tryParse(lastMsg['createdAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class Message {
  final String id;
  final String conversationId;
  final String senderId;
  final String? senderName;
  final String body;
  final DateTime? readAt;
  final DateTime createdAt;

  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    this.senderName,
    required this.body,
    this.readAt,
    required this.createdAt,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] as Map<String, dynamic>?;
    return Message(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      senderId: json['senderId'] as String,
      senderName: sender?['name'] as String?,
      body: json['body'] as String,
      readAt: json['readAt'] != null
          ? DateTime.tryParse(json['readAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
