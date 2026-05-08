import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Prisma.InputJsonValue | null;
  dedupeKey?: string | null;
};

export function createNotification(input: CreateNotificationInput) {
  const { userId, type, title, body, link, data, dedupeKey } = input;
  const normalizedData = data ?? Prisma.JsonNull;

  if (dedupeKey) {
    return prisma.notification.upsert({
      where: { dedupeKey },
      update: {
        type,
        title,
        body,
        link: link ?? null,
        data: normalizedData,
        readAt: null,
      },
      create: {
        userId,
        type,
        title,
        body,
        link: link ?? null,
        data: normalizedData,
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
      data: normalizedData,
    },
  });
}

export function createNotifications(inputs: CreateNotificationInput[]) {
  const validInputs = inputs.filter((input) => input.userId);
  if (validInputs.length === 0) return [];

  return prisma.$transaction(validInputs.map((input) => createNotification(input)));
}
