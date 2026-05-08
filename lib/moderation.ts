export type ModerationCategory =
  | 'fake_product'
  | 'prohibited_item'
  | 'scam_wording'
  | 'offensive_content';

export type ModerationConfidence = 'none' | 'low' | 'medium' | 'high';
export type ModerationDecision = 'allow' | 'review' | 'block';

export type ModerationReason = {
  category: ModerationCategory;
  label: string;
  explanation: string;
  matches: string[];
  confidence: ModerationConfidence;
  score: number;
};

export type ModerationResult = {
  decision: ModerationDecision;
  confidence: ModerationConfidence;
  flagged: boolean;
  score: number;
  reasons: ModerationReason[];
};

type Surface = 'listing' | 'message';

type RuleConfig = {
  category: ModerationCategory;
  label: string;
  explanation: string;
  keywords: readonly string[];
  confidence: ModerationConfidence;
  score: number;
  minimumMatches?: number;
};

const MODERATION_POLICY = {
  counterfeitDirect: [
    'replica',
    'counterfeit',
    'knockoff',
    'bootleg',
    'fake designer',
    'not authentic',
    'mirror quality',
  ],
  counterfeitSuspicious: [
    '1:1',
    'dupe',
    'copy of',
    'inspired by',
    'aaa quality',
  ],
  prohibitedItems: [
    'gun',
    'pistol',
    'rifle',
    'ammo',
    'ammunition',
    'ghost gun',
    'switchblade',
    'cocaine',
    'heroin',
    'fentanyl',
    'meth',
    'fake id',
    'forged passport',
    'stolen',
    'serial number removed',
  ],
  scamDirect: [
    'wire transfer',
    'western union',
    'crypto only',
    'gift card',
    'cashapp only',
    'zelle only',
    'friends and family',
    'pay outside the app',
    'telegram',
    'whatsapp',
  ],
  scamSuspicious: [
    'off-platform',
    'act fast',
    'urgent sale',
    'no questions asked',
    'payment first',
    'deposit required',
    'dm me directly',
  ],
  offensive: [
    'fuck',
    'fucking',
    'shithead',
    'asshole',
    'bitch',
    'bastard',
    'whore',
    'slut',
    'dickhead',
  ],
} as const;

const LISTING_RULES: RuleConfig[] = [
  {
    category: 'fake_product',
    label: 'Fake product',
    explanation: 'Listing uses direct counterfeit or authenticity-evasion wording.',
    keywords: MODERATION_POLICY.counterfeitDirect,
    confidence: 'high',
    score: 95,
  },
  {
    category: 'fake_product',
    label: 'Fake product',
    explanation: 'Listing uses suspicious imitation wording that often appears in fake-product listings.',
    keywords: MODERATION_POLICY.counterfeitSuspicious,
    confidence: 'medium',
    score: 60,
  },
  {
    category: 'prohibited_item',
    label: 'Prohibited item',
    explanation: 'Listing mentions a prohibited or unlawful item that should stay in manual review.',
    keywords: MODERATION_POLICY.prohibitedItems,
    confidence: 'high',
    score: 100,
  },
  {
    category: 'scam_wording',
    label: 'Scam wording',
    explanation: 'Listing asks for risky payment or off-platform contact methods.',
    keywords: MODERATION_POLICY.scamDirect,
    confidence: 'high',
    score: 85,
  },
  {
    category: 'scam_wording',
    label: 'Scam wording',
    explanation: 'Listing includes urgency or payment language that can be associated with scams.',
    keywords: MODERATION_POLICY.scamSuspicious,
    confidence: 'medium',
    score: 45,
    minimumMatches: 2,
  },
  {
    category: 'offensive_content',
    label: 'Offensive content',
    explanation: 'Listing contains profanity or abusive language.',
    keywords: MODERATION_POLICY.offensive,
    confidence: 'medium',
    score: 70,
  },
];

const MESSAGE_RULES: RuleConfig[] = [
  {
    category: 'prohibited_item',
    label: 'Prohibited item',
    explanation: 'Message appears to discuss a prohibited or unlawful item.',
    keywords: MODERATION_POLICY.prohibitedItems,
    confidence: 'high',
    score: 100,
  },
  {
    category: 'scam_wording',
    label: 'Scam wording',
    explanation: 'Message asks for risky payment or off-platform contact.',
    keywords: MODERATION_POLICY.scamDirect,
    confidence: 'high',
    score: 90,
  },
  {
    category: 'scam_wording',
    label: 'Scam wording',
    explanation: 'Message combines several suspicious scam cues.',
    keywords: MODERATION_POLICY.scamSuspicious,
    confidence: 'medium',
    score: 55,
    minimumMatches: 2,
  },
  {
    category: 'offensive_content',
    label: 'Offensive content',
    explanation: 'Message includes abusive or offensive language.',
    keywords: MODERATION_POLICY.offensive,
    confidence: 'high',
    score: 80,
  },
];

function normalizeContent(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatches(content: string, keywords: readonly string[]) {
  return keywords.filter((keyword) => {
    if (/^[a-z0-9 ]+$/i.test(keyword)) {
      return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(content);
    }

    return content.includes(keyword.toLowerCase());
  });
}

function pushReason(reasons: ModerationReason[], content: string, rule: RuleConfig) {
  const matches = findMatches(content, rule.keywords);
  const minimumMatches = rule.minimumMatches ?? 1;
  if (matches.length < minimumMatches) {
    return;
  }

  reasons.push({
    category: rule.category,
    label: rule.label,
    explanation: rule.explanation,
    matches,
    confidence: rule.confidence,
    score: rule.score,
  });
}

function shouldBlockMessage(reasons: ModerationReason[]) {
  return reasons.some((reason) => (
    reason.category === 'prohibited_item'
    || reason.category === 'offensive_content'
    || (reason.category === 'scam_wording' && reason.confidence === 'high')
  ));
}

function finalizeModeration(surface: Surface, reasons: ModerationReason[]): ModerationResult {
  const score = reasons.reduce((sum, reason) => sum + reason.score, 0);
  const confidence: ModerationConfidence =
    reasons.length === 0
      ? 'none'
      : reasons.some((reason) => reason.confidence === 'high')
      ? 'high'
      : reasons.some((reason) => reason.confidence === 'medium')
        ? 'medium'
        : 'low';

  let decision: ModerationDecision = 'allow';

  if (surface === 'listing' && reasons.length > 0) {
    decision = 'review';
  }

  if (surface === 'message' && shouldBlockMessage(reasons)) {
    decision = 'block';
  }

  return {
    decision,
    confidence,
    flagged: reasons.length > 0,
    score,
    reasons,
  };
}

export function evaluateListingModeration(input: {
  title: string;
  description: string;
  category?: string | null;
  condition?: string | null;
}) {
  const content = normalizeContent(
    [input.title, input.description, input.category, input.condition]
      .filter((value) => value != null)
      .join(' '),
  );
  const reasons: ModerationReason[] = [];

  for (const rule of LISTING_RULES) {
    pushReason(reasons, content, rule);
  }

  return finalizeModeration('listing', reasons);
}

export function evaluateMessageModeration(body: string) {
  const content = normalizeContent(body);
  const reasons: ModerationReason[] = [];

  for (const rule of MESSAGE_RULES) {
    pushReason(reasons, content, rule);
  }

  return finalizeModeration('message', reasons);
}

export function formatModerationSummary(result: ModerationResult) {
  if (!result.flagged) {
    return 'No moderation signals';
  }

  return `${result.confidence.toUpperCase()} risk · ${Array.from(
    new Set(result.reasons.map((reason) => `${reason.label} (${reason.confidence})`)),
  ).join(' · ')}`;
}

export function formatBlockedMessage(result: ModerationResult) {
  if (result.flagged) {
    const details = result.reasons
      .map((reason) => `${reason.label.toLowerCase()} (${reason.matches.join(', ')})`)
      .join('; ');

    return `Message not sent: ${details}. Please keep messages respectful and on-platform.`;
  }

  if (!result.flagged) {
    return 'Message was blocked by moderation review.';
  }

  return 'Message not sent.';
}
