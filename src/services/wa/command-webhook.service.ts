import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { logger } from '@/src/common/utils/logger';
import { db } from '@/src/db/connection';
import { apps } from '@/src/db/schema/schema';

const log = logger.child({ module: 'command-webhook' });

/** Normalize JID to digits-only for user comparison (e.g. 6281234567890@s.whatsapp.net -> 6281234567890). */
function jidToPhone(jid: string): string {
  const numberPart = jid.split('@')[0];
  return numberPart?.replace(/\D/g, '') ?? '';
}

// command message is start with one of the commands in the list
function messageMatchesCommandList(commandMessage: string, commandList: string[]): boolean {
  return commandList.some((cmd) => commandMessage.startsWith(cmd));
}

/** Check if source JID is allowed for this app (group in commandAllowedGroups or user in commandAllowedUsers). */
function sourceAllowed(
  sourceJid: string,
  allowedGroups: string[] | null,
  allowedUsers: string[] | null
): boolean {
  const isGroup = sourceJid.endsWith('@g.us');
  if (isGroup) {
    if (!allowedGroups?.length) return false;
    return allowedGroups.includes(sourceJid);
  }
  if (!allowedUsers?.length) return false;
  const phone = jidToPhone(sourceJid);
  const normalizedAllowed = allowedUsers.map((u) => u.replace(/\D/g, ''));
  return normalizedAllowed.includes(phone);
}

/**
 * Process an incoming message for an instance: if it starts with "!", find apps that have
 * a matching command and allow the source (group/user), then POST { source, commandMessage } to their webhook.
 */
export async function processCommandMessage(
  instanceId: number,
  sourceJid: string,
  commandMessage: string
): Promise<void> {
  if (!commandMessage.startsWith('!')) return;

  const appRows = await db
    .select({
      id: apps.id,
      name: apps.name,
      commandWebHook: apps.commandWebHook,
      commandList: apps.commandList,
      commandAllowedGroups: apps.commandAllowedGroups,
      commandAllowedUsers: apps.commandAllowedUsers,
    })
    .from(apps)
    .where(
      and(
        eq(apps.instanceId, instanceId),
        eq(apps.isActive, 1),
        isNotNull(apps.commandWebHook),
        sql`${apps.commandList} IS NOT NULL AND jsonb_array_length(${apps.commandList}) > 0`
      )
    );

  for (const app of appRows) {
    const webHook = app.commandWebHook;
    const list = app.commandList ?? [];
    if (!webHook || list.length === 0) continue;
    if (!messageMatchesCommandList(commandMessage, list)) continue;
    if (
      !sourceAllowed(sourceJid, app.commandAllowedGroups ?? null, app.commandAllowedUsers ?? null)
    )
      continue;

    try {
      const res = await fetch(webHook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourceJid, commandMessage }),
      });
      if (!res.ok) {
        log.warn(
          { appId: app.id, appName: app.name, status: res.status, url: webHook },
          'Command webhook responded with non-OK status'
        );
      }
    } catch (err) {
      log.error(
        { err, appId: app.id, appName: app.name, url: webHook },
        'Command webhook request failed'
      );
    }
  }
}
