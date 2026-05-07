import '../models/conversation.dart';
import 'api_client.dart';
import 'product_service.dart' show ServiceException;

class MessageService {
  final ApiClient _client;
  MessageService({ApiClient? client}) : _client = client ?? ApiClient();

  /// Fetch all conversations for the current user.
  Future<List<Conversation>> fetchConversations() async {
    final res = await _client.get('/api/messages');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load messages');
    final list = res.data as List<dynamic>;
    return list
        .map((j) => Conversation.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single conversation thread with messages.
  Future<Map<String, dynamic>> fetchThread(String conversationId) async {
    final res = await _client.get('/api/messages/$conversationId');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load thread');
    return res.data as Map<String, dynamic>;
  }

  /// Start or retrieve a conversation about a product.
  Future<Conversation> startConversation(String productId) async {
    final res = await _client.post('/api/messages', body: {'productId': productId});
    if (!res.ok) throw ServiceException(res.error ?? 'Could not start conversation');
    return Conversation.fromJson(res.data as Map<String, dynamic>);
  }

  /// Reply to an existing conversation.
  Future<Message> reply(String conversationId, String body) async {
    final res = await _client.post(
      '/api/messages/$conversationId',
      body: {'body': body},
    );
    if (!res.ok) throw ServiceException(res.error ?? 'Could not send message');
    return Message.fromJson(res.data as Map<String, dynamic>);
  }
}
