import { redis, redisSubscriber } from "./redis";

type EventPayload = {
  type: string;
  payload: Record<string, unknown>;
};

type Subscriber = (event: EventPayload) => void;

const subscribers = new Map<string, Set<Subscriber>>();
let subscriptionReady = false;

async function ensureRedisSubscriptions() {
  if (subscriptionReady) {
    return;
  }

  subscriptionReady = true;

  await redisSubscriber.psubscribe("events:user:*");
  redisSubscriber.on("pmessage", (_pattern, channel, message) => {
    const userId = channel.replace("events:user:", "");
    const current = subscribers.get(userId);

    if (!current) {
      return;
    }

    const event = JSON.parse(message) as EventPayload;

    for (const subscriber of current) {
      subscriber(event);
    }
  });
}

export function subscribeToUserEvents(userId: string, subscriber: Subscriber) {
  void ensureRedisSubscriptions();
  const current = subscribers.get(userId) ?? new Set<Subscriber>();
  current.add(subscriber);
  subscribers.set(userId, current);

  return () => {
    const next = subscribers.get(userId);

    if (!next) {
      return;
    }

    next.delete(subscriber);

    if (next.size === 0) {
      subscribers.delete(userId);
    }
  };
}

export function publishUserEvent(
  userId: string,
  type: string,
  payload: Record<string, unknown> = {}
) {
  void redis.publish(
    `events:user:${userId}`,
    JSON.stringify({
      type,
      payload
    } satisfies EventPayload)
  );

  const current = subscribers.get(userId);

  if (!current) {
    return;
  }

  for (const subscriber of current) {
    subscriber({
      type,
      payload
    });
  }
}
