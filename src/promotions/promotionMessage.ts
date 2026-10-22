/**
 * Escapes characters for Telegram HTML mode
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface PromotionMessagePayload {
  text: string;
  parse_mode: 'HTML';
  link_preview_options: {
    is_disabled: boolean;
  };
}

/**
 * Builds the respectful, non-intrusive promotional message for the group.
 * Link preview is explicitly disabled to keep the group chat clean.
 */
export function buildPromotionMessage(websiteUrl: string): PromotionMessagePayload {
  const safeUrl = websiteUrl.trim();

  const text = [
    '❤️ <b>Looking to make new connections?</b>',
    '',
    'Discover our social-connection platform:',
    `<a href="${escapeHtml(safeUrl)}">${escapeHtml(safeUrl)}</a>`,
    '',
    '<i>Check it out if you\'re interested.</i>',
  ].join('\n');

  return {
    text,
    parse_mode: 'HTML',
    link_preview_options: {
      is_disabled: true,
    },
  };
}

/**
 * Short message shown when an authorized user or group member triggers /connect
 */
export function buildConnectMessage(websiteUrl: string): PromotionMessagePayload {
  const safeUrl = websiteUrl.trim();

  const text = [
    '👋 <b>Welcome!</b>',
    '',
    'We run a social-connection website where movie lovers and community members can connect, chat, and make genuine friends.',
    '',
    `🌐 <b>Visit us:</b> <a href="${escapeHtml(safeUrl)}">${escapeHtml(safeUrl)}</a>`,
  ].join('\n');

  return {
    text,
    parse_mode: 'HTML',
    link_preview_options: {
      is_disabled: true,
    },
  };
}
