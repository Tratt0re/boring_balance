export interface LandingCard {
  title: string;
  description: string;
}

export interface LandingFact {
  label: string;
  value: string;
}

export interface LandingFaq {
  question: string;
  answer: string;
}

export const LANDING_BENEFITS: LandingCard[] = [
  {
    title: 'See the full picture quickly',
    description: 'Review accounts and net worth without turning money into a side project.',
  },
  {
    title: 'Keep routine work boring',
    description: 'Budgets, categories, and recurring entries stay visible without extra ceremony.',
  },
  {
    title: 'Keep the file in your hands',
    description: 'Your finance data stays on your computer, in a file you can move or back up.',
  },
];

export const LANDING_AUDIENCES: LandingCard[] = [
  {
    title: 'Prefer a desktop ledger',
    description:
      'Use a real desktop app for tracking money without falling back to spreadsheets or browser tabs.',
  },
  {
    title: 'Want steadier budgeting',
    description: 'Keep budgets, balances, and expenses tidy without alerts, streaks, or filler.',
  },
  {
    title: 'Need local ownership',
    description: 'Keep your records on-device instead of handing them to a hosted service.',
  },
];

export const LANDING_SUMMARY_FACTS: LandingFact[] = [
  {
    label: 'App type',
    value: 'Desktop finance app',
  },
  {
    label: 'Platforms',
    value: 'Windows, macOS, Linux',
  },
  {
    label: 'Best for',
    value: 'Balances, expenses, budgets',
  },
  {
    label: 'Data storage',
    value: 'Single local SQLite file',
  },
  {
    label: 'Download source',
    value: 'GitHub Releases',
  },
  {
    label: 'Project model',
    value: 'Open source, no account',
  },
];

export const LANDING_FAQS: LandingFaq[] = [
  {
    question: 'Why a desktop app?',
    answer:
      'A desktop app gives you room to sit down, review your balances, and stay aware of what is happening.',
  },
  {
    question: 'Is Boring Balance local-first and privacy-friendly?',
    answer:
      'Yes. Your data stays under your control. You can manage backups and sync folders, but the app does not send data or metrics to any service.',
  },
  {
    question: 'Why doesn\'t Boring Balance automate everything?',
    answer:
      'Because personal finance works better when you stay involved. The goal is clarity, not distance.',
  },
  {
    question: 'Where do I download Boring Balance?',
    answer: 'You can download it from GitHub.',
  },
  {
    question: 'Is Boring Balance open source?',
    answer:
      'Yes. Boring Balance is open source. You can inspect the code, leave feedback, or suggest improvements.',
  },
];
