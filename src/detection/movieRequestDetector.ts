export interface DetectionOptions {
  minLength?: number;
  maxLength?: number;
  ignoredWords?: string[];
  customPatterns?: RegExp[];
}

export interface DetectionResult {
  isMatch: boolean;
  confidence: number; // 0 to 1
  reason: string;
  detectedYear?: number;
  detectedQuality?: string;
  normalizedTitle?: string;
}

// Common video resolution & format tags commonly appended to movie requests in Telegram
const QUALITY_TAGS_REGEX = /\b(4k|2160p|1080p|720p|480p|360p|bluray|blu-ray|brrip|bdrip|web-?dl|webrip|hdrip|camrip|dvdrip|x264|x265|hevc|hindi|tamil|telugu|malayalam|kannada|english|dual\s*audio|multi\s*audio|sub|esub)\b/gi;

// Year patterns: 4 digits between 1920 and 2035 (optionally inside parentheses or brackets)
const YEAR_REGEX = /(?:\(|\b)(19[2-9]\d|20[0-3]\d)(?:\)|\b)/;

// Typical chat filler phrases that indicate conversational dialogue rather than a movie title request
const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|hola|namaste|yo|hlo|gm|gn)\b/i,
  /\b(how are you|good morning|good evening|good night|anyone here|can someone help)\b/i,
  /\b(thank you|thanks a lot|thx|tq|welcome)\b/i,
  /\b(how to download|how to get|link not working|bot dead|admin contact|scam|fake)\b/i,
  /\b(add me|send link|channel link|share link|join my)\b/i,
  /\b(where is the file|why not working|not found|please fix)\b/i,
];

// URLs, Telegram invite links, mentions, or suspicious spam patterns
const SPAM_OR_LINK_PATTERNS = [
  /https?:\/\/\S+/i,
  /t\.me\/\S+/i,
  /@\w+/i,
  /\.(apk|exe|bat|sh|zip|rar|tar\.gz)\b/i,
];

export const DEFAULT_IGNORED_WORDS = [
  'hi',
  'hello',
  'hey',
  'good morning',
  'good night',
  'thanks',
  'thank you',
  'thx',
  'ok',
  'okay',
  'yes',
  'no',
  'help',
  'admin',
  'rules',
  'anyone online',
  'link',
  'how to download',
  'bot not working',
  'test',
];

/**
 * Heuristically detects whether an incoming Telegram text message is a movie title request.
 *
 * NOTE: As free-text title detection is inherently heuristic (titles can be arbitrary words like "Her" or "Up"),
 * this detector evaluates syntactic clues, release years, quality tags, and filters out common chatter.
 */
export function detectMovieRequest(
  rawText: string | undefined | null,
  options: DetectionOptions = {}
): DetectionResult {
  if (!rawText || typeof rawText !== 'string') {
    return { isMatch: false, confidence: 0, reason: 'Empty or non-string message' };
  }

  const text = rawText.trim();
  const minLength = options.minLength ?? 2;
  const maxLength = options.maxLength ?? 80;

  // 1. Check length boundaries
  if (text.length < minLength) {
    return { isMatch: false, confidence: 0, reason: `Message too short (< ${minLength} characters)` };
  }
  if (text.length > maxLength) {
    return { isMatch: false, confidence: 0, reason: `Message too long (> ${maxLength} characters)` };
  }

  // 2. Reject commands
  if (text.startsWith('/')) {
    return { isMatch: false, confidence: 0, reason: 'Command message (starts with /)' };
  }

  // 3. Reject links, handles, and file downloads
  for (const pattern of SPAM_OR_LINK_PATTERNS) {
    if (pattern.test(text)) {
      return { isMatch: false, confidence: 0, reason: 'Contains URL, mention, or executable extension' };
    }
  }

  // 4. Reject pure numbers or pure punctuation
  const strippedOfPunctuationAndNumbers = text.replace(/[\d\s\p{P}\p{S}]/gu, '');
  if (strippedOfPunctuationAndNumbers.length === 0) {
    return { isMatch: false, confidence: 0, reason: 'Message contains only digits or punctuation' };
  }

  // 5. Check ignored words allowlist/blocklist
  const lowerText = text.toLowerCase();
  const ignoredList = options.ignoredWords ?? DEFAULT_IGNORED_WORDS;
  for (const ignored of ignoredList) {
    const cleanIgnored = ignored.trim().toLowerCase();
    if (cleanIgnored && lowerText === cleanIgnored) {
      return { isMatch: false, confidence: 0, reason: `Matches ignored word: "${ignored}"` };
    }
  }

  // 6. Reject common conversational chatter
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(text)) {
      return { isMatch: false, confidence: 0, reason: 'Conversational chat phrase detected' };
    }
  }

  // 7. Check custom administrator regex patterns if supplied
  if (options.customPatterns && options.customPatterns.length > 0) {
    for (const customPattern of options.customPatterns) {
      if (customPattern.test(text)) {
        return {
          isMatch: true,
          confidence: 0.95,
          reason: `Matched custom administrator pattern: ${customPattern.source}`,
          normalizedTitle: text,
        };
      }
    }
  }

  // 8. Analyze movie indicators (Release Year, Quality Tags, Title Words)
  let detectedYear: number | undefined;
  const yearMatch = text.match(YEAR_REGEX);
  if (yearMatch) {
    detectedYear = parseInt(yearMatch[1], 10);
  }

  let detectedQuality: string | undefined;
  const qualityMatch = text.match(QUALITY_TAGS_REGEX);
  if (qualityMatch) {
    detectedQuality = qualityMatch.join(', ');
  }

  // Clean the title by stripping year and quality markers to examine remaining title text
  const cleanTitle = text
    .replace(QUALITY_TAGS_REGEX, '')
    .replace(YEAR_REGEX, '')
    .replace(/[()[\]{}_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Score confidence
  let confidence = 0.6; // Baseline for short-to-medium text passing chatter checks

  if (detectedYear) {
    confidence += 0.25; // "Leo 2023" -> strongly indicates a movie title with release year
  }
  if (detectedQuality) {
    confidence += 0.15; // "Interstellar 1080p" -> strongly indicates a media file search
  }

  // Reject if remaining title is empty (e.g. user just typed "1080p" or "2024")
  if (cleanTitle.length < 2) {
    return { isMatch: false, confidence: 0, reason: 'No distinct title remains after stripping year/quality tags' };
  }

  // Multi-word titles (e.g., "Avengers Endgame", "Dune Part Two", "KGF Chapter 2")
  const wordCount = cleanTitle.split(/\s+/).length;
  if (wordCount > 10) {
    return { isMatch: false, confidence: 0.2, reason: 'Too many words for a typical movie title search' };
  }

  return {
    isMatch: true,
    confidence: Math.min(1.0, confidence),
    reason: detectedYear
      ? `Likely movie request with release year ${detectedYear}`
      : detectedQuality
      ? `Likely movie request with quality tag (${detectedQuality})`
      : 'Standard title query format',
    detectedYear,
    detectedQuality,
    normalizedTitle: cleanTitle,
  };
}
