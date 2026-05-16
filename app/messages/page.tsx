import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getInboxConversations, getMessagePreview } from '@/lib/messages';
import UserAvatar from '@/components/UserAvatar';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Messages' };

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const conversations = await getInboxConversations(userId);
  const unreadSummary = conversations.reduce(
    (summary, conversation) => ({
      unreadCount: summary.unreadCount + conversation.unreadCount,
      unreadConversations:
        summary.unreadConversations + (conversation.unreadCount > 0 ? 1 : 0),
    }),
    { unreadCount: 0, unreadConversations: 0 },
  );

  return (
    <main className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-6">Messages</h1>

      {unreadSummary.unreadCount > 0 && (
        <div className="card p-4 mb-4 bg-blue-50 border-blue-200 text-blue-900">
          <p className="font-semibold">
            {unreadSummary.unreadCount} new message{unreadSummary.unreadCount === 1 ? '' : 's'}
          </p>
          <p className="text-sm mt-1">
            You have unread activity in {unreadSummary.unreadConversations} conversation{unreadSummary.unreadConversations === 1 ? '' : 's'}.
          </p>
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          <p className="text-lg font-medium mb-2">No messages yet</p>
          <p className="text-sm mb-4">
            Visit a product listing and tap <strong>Message Seller</strong> to start a conversation.
          </p>
          <Link href="/" className="btn-primary">Browse listings</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => {
            const lastMsg = conv.messages[0];
            const unread = conv.unreadCount > 0;

            return (
              <Link
                key={conv.id}
                href={`/messages/${conv.id}`}
                className={`card p-4 flex gap-4 items-start hover:border-blue-300 transition-colors ${unread ? 'border-blue-200 bg-blue-50' : ''}`}
              >
                {/* Product image */}
                <div className="relative w-14 h-14 flex-shrink-0 bg-slate-100 rounded-xl overflow-hidden">
                  <Image
                    src={conv.product.imageUrl}
                    alt={conv.product.title}
                    fill
                    className="object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm truncate">{conv.product.title}</p>
                      {conv.buyerId === userId ? (
                        <p className="text-xs text-slate-500">Seller: {conv.seller.name}</p>
                      ) : (
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <UserAvatar imageUrl={conv.buyer.profileImageUrl} name={conv.buyer.name} className="h-5 w-5" />
                          <span className="truncate">Buyer: {conv.buyer.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {lastMsg && (
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          {timeAgo(lastMsg.createdAt)}
                        </span>
                      )}
                      {unread && <span className="badge badge-blue text-[11px]">{conv.unreadCount} new</span>}
                    </div>
                  </div>

                  {lastMsg ? (
                    <p className={`text-sm mt-1 truncate ${unread ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                      {lastMsg.senderId === userId ? 'You: ' : ''}
                      {getMessagePreview(lastMsg)}
                    </p>
                  ) : (
                    <p className="text-sm mt-1 text-slate-400 italic">No messages yet</p>
                  )}

                  {conv.product.status === 'SOLD' && (
                    <span className="badge-slate badge mt-1">Sold</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
