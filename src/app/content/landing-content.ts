export interface LandingCard {
  title: string;
  description: string;
}

export interface LandingFaq {
  question: string;
  answer: string;
}

export const LANDING_AUDIENCES: LandingCard[] = [
  {
    title: "You've outgrown the spreadsheet",
    description:
      'Accounts, categories, budgets and charts, without a sheet to build and maintain yourself.',
  },
  {
    title: "You don't want a finance app watching you",
    description: 'No sign-up, no analytics, no ads. Your numbers stay on your computer.',
  },
  {
    title: "You'd rather review than be nudged",
    description: 'A calm place to see where the money went, with no alerts or streaks.',
  },
];

export const LANDING_FAQS: LandingFaq[] = [
  {
    question: 'Does it connect to my bank?',
    answer:
      'Not today. You add transactions yourself or import them from an Excel file. Linking bank accounts is planned.',
  },
  {
    question: 'Does it send my data anywhere?',
    answer:
      'No. There is no account, no analytics and no server. The only network request is a check for new releases on GitHub, which sends none of your data. Backups and sync write only to folders you choose.',
  },
  {
    question: 'Where is my data, and how do I back it up?',
    answer:
      'In one SQLite file on your computer. Copy it anywhere, or have the app save backups to a folder you pick and restore from them.',
  },
  {
    question: 'Can I use it on more than one computer?',
    answer:
      'Optionally. Point the app at a shared folder, such as a cloud drive, a NAS or a USB drive, and it saves snapshots there. There is no Boring Balance cloud.',
  },
  {
    question: 'Is it really free?',
    answer: 'Yes. It is MIT-licensed, with no subscription, no ads and no paid tier.',
  },
  {
    question: 'Where do I download it?',
    answer:
      'From GitHub Releases. The download button at the top picks the right build for your system.',
  },
  {
    question: "Why doesn't it automate everything?",
    answer:
      'Looking at your own numbers is how you understand them. Boring Balance gives you tools to review, not an autopilot.',
  },
];
