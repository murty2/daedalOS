import {
  nip19,
  nip04,
  generatePrivateKey,
  getPublicKey,
  getEventHash,
  getSignature,
} from "nostr-tools";
import type { Event } from "nostr-tools";
import type {
  ChatEvents,
  NostrEvents,
  NostrProfile,
  ProfileData,
} from "components/apps/Messenger/types";
import {
  BASE_NIP05_URL,
  BASE_RW_RELAYS,
  DM_KIND,
  GROUP_TIME_GAP_IN_SECONDS,
  PRIVATE_KEY_IDB_NAME,
  PUBLIC_KEY_IDB_NAME,
  TIME_FORMAT,
} from "components/apps/Messenger/constants";
import { MILLISECONDS_IN_DAY, MILLISECONDS_IN_SECOND } from "utils/constants";
import { dateToUnix } from "nostr-react";
import type { ProfilePointer } from "nostr-tools/lib/nip19";
import type { NIP05Result } from "nostr-tools/lib/nip05";

export const getRelayUrls = async (): Promise<string[]> => {
  if (window.nostr?.getRelays) {
    return [
      ...new Set([
        ...BASE_RW_RELAYS,
        ...Object.entries(await window.nostr.getRelays()).map(([url]) =>
          url.endsWith("/") ? url.slice(0, -1) : url
        ),
      ]),
    ];
  }

  return BASE_RW_RELAYS;
};

export const toHexKey = (key: string): string => {
  if (key.startsWith("npub") || key.startsWith("nsec")) {
    try {
      const { data } = nip19.decode(key);

      if (typeof data === "string") return data;
    } catch {
      return key;
    }
  }

  return key;
};

const getPrivateKey = (): string =>
  localStorage.getItem(PRIVATE_KEY_IDB_NAME) || "";

export const maybeGetExistingPublicKey = async (): Promise<string> =>
  (await window.nostr?.getPublicKey()) ||
  localStorage.getItem(PUBLIC_KEY_IDB_NAME) ||
  "";

export const getKeyFromTags = (tags: string[][] = []): string => {
  const [, key = ""] = tags.find(([tag]) => tag === "p") || [];

  return key;
};

const decryptedContent: Record<string, string> = {};

export const decryptMessage = async (
  id: string,
  content: string,
  pubkey: string
): Promise<string> => {
  if (decryptedContent[id]) return decryptedContent[id];

  decryptedContent[id] = content;

  try {
    const message = await (window.nostr?.nip04
      ? window.nostr.nip04.decrypt(pubkey, content)
      : nip04.decrypt(toHexKey(getPrivateKey()), pubkey, content));

    decryptedContent[id] = message;

    return message;
  } catch {
    decryptedContent[id] = "";

    return "";
  }
};

const encryptMessage = async (
  content: string,
  pubkey: string
): Promise<string> => {
  try {
    return await (window.nostr?.nip04
      ? window.nostr.nip04.encrypt(pubkey, content)
      : nip04.encrypt(toHexKey(getPrivateKey()), pubkey, content));
  } catch {
    // Ignore failure to decrypt
  }

  return "";
};

export const getReceivedMessages = (publicKey?: string): NostrEvents => ({
  enabled: !!publicKey,
  filter: {
    "#p": publicKey ? [publicKey] : [],
    kinds: [DM_KIND],
  },
});

export const getSentMessages = (publicKey?: string): NostrEvents => ({
  enabled: !!publicKey,
  filter: {
    authors: publicKey ? [publicKey] : [],
    kinds: [DM_KIND],
  },
});

export const getPublicHexKey = (existingPublicKey?: string): string => {
  if (existingPublicKey) return toHexKey(existingPublicKey);

  const newPrivateKey = generatePrivateKey();
  const newPublicKey = getPublicKey(newPrivateKey);

  localStorage.setItem(PUBLIC_KEY_IDB_NAME, newPublicKey);
  localStorage.setItem(PRIVATE_KEY_IDB_NAME, newPrivateKey);

  return toHexKey(newPublicKey);
};

export const ascCreatedAt = (a: Event, b: Event): number =>
  a.created_at - b.created_at;

export const descCreatedAt = (a: Event, b: Event): number =>
  b.created_at - a.created_at;

export const shortTimeStamp = (timestamp: number): string => {
  const now = Date.now();
  const time = new Date(timestamp * MILLISECONDS_IN_SECOND).getTime();
  const diff = now - time;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  if (seconds < 10) return "now";

  return `${seconds}s`;
};

export const createMessageEvent = async (
  message: string,
  publicKey: string,
  recipientPublicKey: string
): Promise<Event> => {
  let event = {
    content: await encryptMessage(message, recipientPublicKey),
    created_at: dateToUnix(),
    kind: DM_KIND,
    pubkey: publicKey,
    tags: [["p", recipientPublicKey]],
  } as Event;

  event.id = getEventHash(event);

  if (window.nostr?.signEvent) {
    event = await window.nostr.signEvent(event);
  } else {
    event.sig = getSignature(event, toHexKey(getPrivateKey()));
  }

  return event;
};

export const dataToProfile = (
  publicKey: string,
  data?: ProfileData
): NostrProfile => {
  const {
    about,
    banner,
    display_name,
    name,
    nip05,
    npub,
    picture,
    username,
    website,
  } = data || {};

  return {
    about,
    banner,
    nip05,
    picture,
    userName:
      display_name ||
      name ||
      username ||
      (
        npub ||
        (publicKey.startsWith("npub") ? publicKey : nip19.npubEncode(publicKey))
      ).slice(0, 12),
    website,
  };
};

export const getPublicHexFromNostrAddress = (key: string): string => {
  const nprofile = key.startsWith("nprofile");
  const nsec = key.startsWith("nsec");

  if (nprofile || nsec || key.startsWith("npub")) {
    try {
      const { data } = nip19.decode(key) || {};
      const hex = nprofile
        ? (data as ProfilePointer)?.pubkey
        : (data as string);

      return nsec ? getPublicKey(hex) : hex;
    } catch {
      return "";
    }
  }

  try {
    return toHexKey(nip19.npubEncode(key));
  } catch {
    return "";
  }
};

const verifiedNip05Addresses: Record<string, string | false> = {};

export const getNip05Domain = async (
  nip05address?: string,
  pubkey?: string
): Promise<string> => {
  if (!nip05address || !pubkey) return "";

  try {
    const [userName, domain] = nip05address.split("@");

    if (verifiedNip05Addresses[pubkey] === domain) return domain;

    const nostrJson = await fetch(`https://${domain}${BASE_NIP05_URL}`);

    if (nostrJson.ok) {
      const { names = {} } = ((await nostrJson.json()) as NIP05Result) || {};
      let verified = false;

      if (userName === "_") {
        const [userKey, ...otherKeys] = Object.values(names);
        const keyValue = otherKeys.length === 0 ? userKey : names[userName];

        verified = keyValue === pubkey;
      } else if (names[userName]) {
        verified = names[userName] === pubkey;
      }

      if (verified) {
        verifiedNip05Addresses[pubkey] = domain;
      }

      return verified ? domain : "";
    }

    verifiedNip05Addresses[pubkey] = false;
  } catch {
    verifiedNip05Addresses[pubkey] = false;
  }

  return "";
};

export const getWebSocketStatusIcon = (status?: number): string => {
  switch (status) {
    case WebSocket.prototype.CONNECTING:
      return "🟡";
    case WebSocket.prototype.OPEN:
      return "🟢";
    case WebSocket.prototype.CLOSING:
      return "🟠";
    default:
      return "🔴";
  }
};

export const convertImageLinksToHtml = (content: string): string =>
  content.replace(
    /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/gi,
    (match) => `<img src="${match}" />`
  );

const prettyChatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * MILLISECONDS_IN_SECOND);
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  ).getTime();
  const dateTimestamp = date.getTime();
  const datePretty = date.toLocaleString("en-US", TIME_FORMAT);

  if (dateTimestamp > today) return datePretty;
  if (dateTimestamp > yesterday) return `Yesterday at ${datePretty}`;
  if (dateTimestamp > today - 6 * MILLISECONDS_IN_DAY) {
    return date.toLocaleString("en-US", {
      ...TIME_FORMAT,
      weekday: "long",
    });
  }

  return date.toLocaleString("en-US", {
    ...TIME_FORMAT,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const groupChatEvents = (events: Event[]): ChatEvents => {
  if (events.length === 0) return [];

  const sortedEvents = events.sort(ascCreatedAt);
  const [oldestEvent, ...remainingEvents] = sortedEvents;
  const groupedEvents: ChatEvents = [
    [prettyChatTimestamp(oldestEvent.created_at), [oldestEvent]],
  ];

  remainingEvents.forEach((event) => {
    const { created_at } = event;
    const [, lastGroupedEvents] = groupedEvents[groupedEvents.length - 1];
    const { created_at: last_created_at } =
      lastGroupedEvents[lastGroupedEvents.length - 1];

    if (Math.abs(created_at - last_created_at) < GROUP_TIME_GAP_IN_SECONDS) {
      lastGroupedEvents.push(event);
    } else {
      groupedEvents.push([prettyChatTimestamp(created_at), [event]]);
    }
  });

  return groupedEvents;
};
