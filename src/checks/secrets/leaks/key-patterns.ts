// Well-known API key formats. To add one: one line here, nothing else.
// prefix: a cheap POSIX ERE that finds candidate lines with git grep.
// pattern: the exact format, with word boundaries and minimum lengths, so ordinary code doesn't match.
// Order matters: Anthropic keys also start with "sk-", so they are tested first.
export const KEYS: { kind: string; prefix: string; pattern: RegExp }[] = [
  { kind: "Anthropic API key", prefix: "sk-ant-", pattern: /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{32,}/ },
  { kind: "OpenAI API key", prefix: "sk-", pattern: /(?<![A-Za-z0-9])sk-(proj-)?[A-Za-z0-9_-]{32,}/ },
  { kind: "AWS access key", prefix: "AKIA", pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/ },
  {
    kind: "GitHub token",
    prefix: "gh[pousr]_|github_pat_",
    pattern: /(?<![A-Za-z0-9])(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})/,
  },
  { kind: "Slack token", prefix: "xox[baprs]-", pattern: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,}/ },
  { kind: "Stripe live key", prefix: "[sr]k_live_", pattern: /(?<![A-Za-z0-9])[sr]k_live_[A-Za-z0-9]{20,}/ },
  { kind: "Google API key", prefix: "AIza", pattern: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/ },
  { kind: "Google OAuth client secret", prefix: "GOCSPX-", pattern: /(?<![A-Za-z0-9])GOCSPX-[A-Za-z0-9_-]{28}/ },
  { kind: "Supabase secret key", prefix: "sb_secret_", pattern: /(?<![A-Za-z0-9])sb_secret_[A-Za-z0-9_-]{20,}/ },
  { kind: "SendGrid API key", prefix: "SG\\.", pattern: /(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },
  { kind: "npm token", prefix: "npm_", pattern: /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{36}/ },
  { kind: "Hugging Face token", prefix: "hf_", pattern: /(?<![A-Za-z0-9])hf_[A-Za-z0-9]{34}/ },
  { kind: "Groq API key", prefix: "gsk_", pattern: /(?<![A-Za-z0-9])gsk_[A-Za-z0-9]{52}/ },
  { kind: "Resend API key", prefix: "re_", pattern: /(?<![A-Za-z0-9])re_[A-Za-z0-9]{8}_[A-Za-z0-9]{24}/ },
];
