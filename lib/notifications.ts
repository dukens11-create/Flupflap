import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Prisma.InputJsonValue | null;
  dedupeKey?: string | null;
};

export async function createNotification(input: CreateNotificationInput) {
  const { userId, type, title, body, link, data, dedupeKey } = input;

  if (dedupeKey) {
    return prisma.notification.upsert({
      where: { dedupeKey },
      update: {
        type,
        title,
        body,
        link: link ?? null,
        data: data ?? null,
        readAt: null,
      },
      create: {
        userId,
        type,
        title,
        body,
        link: link ?? null,
        data: data ?? null,
        dedupeKey,
      },
    });
  }

  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      link: link ?? null,
      data: data ?? null,
    },
  });
}

export async function createNotifications(inputs: CreateNotificationInput[]) {
  const validInputs = inputs.filter((input) => input.userId);
  if (validInputs.length === 0) return [];

  return prisma.$transaction(validInputs.map((input) => createNotification(input)));
}
