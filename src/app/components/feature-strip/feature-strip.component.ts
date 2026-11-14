import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

interface ProofScreen {
  name: string;
  label: string;
  alt: string;
}

interface ProofPoint {
  title: string;
  text: string;
}

const PROOF_POINTS: ProofPoint[] = [
  {
    title: 'Your data stays with you',
    text: 'Your finances live in one SQLite file on your computer. Move it, back it up or sync snapshots to a folder you choose.',
  },
  {
    title: 'The whole picture',
    text: "Net worth across cash, bank, savings, brokerage, crypto and credit accounts. Transfers between your own accounts don't distort income or expenses.",
  },
  {
    title: 'Review, not nagging',
    text: "Open the app when you want to review your money. It won't chase you with alerts, streaks or upsells.",
  },
  {
    title: 'Open source',
    text: 'The entire app is MIT-licensed. Read the code, audit it or build it yourself.',
  },
];

const SCREENS: ProofScreen[] = [
  {
    name: 'transactions',
    label: 'Transactions',
    alt: 'Boring Balance Transactions screen: a table of transactions with coloured category chips, account icons, amounts and paid checkboxes',
  },
  {
    name: 'accounts',
    label: 'Accounts',
    alt: 'Boring Balance Accounts screen listing Cash, Bank, Savings, Broker and Credit card, each with its own colour and icon',
  },
  {
    name: 'budget',
    label: 'Budget',
    alt: 'Boring Balance Budget analysis screen comparing budget and expenses for the Groceries and Leisure categories, with total budget, total expenses and remaining budget',
  },
  {
    name: 'compare',
    label: 'Compare',
    alt: 'Boring Balance Compare screen showing income, expenses and net cash flow for two months side by side, with a radar chart and a category table by month',
  },
];

@Component({
  selector: 'app-feature-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './feature-strip.component.css',
  template: `
    <section aria-labelledby="feature-strip-heading" class="proof">
      <div class="proof-left">
        <h2 id="feature-strip-heading" class="proof-title">
          A private expense tracker that stays out of the way.
        </h2>
        <ul class="proof-list" role="list">
          <li>
            <h3 class="proof-point-title">Your data stays with you</h3>
            <p class="proof-point-text">
              Your finances live in one SQLite file on your computer. Move it, back it up or sync
              snapshots to a folder you choose.
            </p>
          </li>
          <li>
            <h3 class="proof-point-title">The whole picture</h3>
            <p class="proof-point-text">
              Net worth across cash, bank, savings, brokerage, crypto and credit accounts. Transfers
              between your own accounts don't distort income or expenses.
            </p>
          </li>
          <li>
            <h3 class="proof-point-title">Review, not nagging</h3>
            <p class="proof-point-text">
              Open the app when you want to review your money. It won't chase you with alerts,
              streaks or upsells.
            </p>
          </li>
          <li>
            <h3 class="proof-point-title">Open source</h3>
            <p class="proof-point-text">
              The entire app is MIT-licensed. Read the code, audit it or build it yourself.
            </p>
          </li>
        </ul>
      </div>
      <div class="proof-shots">
        @for (screen of screens; track screen.name; let i = $index) {
          <input
            type="radio"
            name="proof-screen"
            class="proof-radio"
            [id]="'proof-screen-' + i"
            [checked]="i === 0"
          />
        }
        <div class="proof-tabs">
          @for (screen of screens; track screen.name; let i = $index) {
            <label class="proof-tab" [attr.for]="'proof-screen-' + i">{{ screen.label }}</label>
          }
        </div>
        @for (screen of screens; track screen.name) {
          <figure class="proof-shot">
            <img
              [src]="'screenshots/' + screen.name + '.webp'"
              width="1600"
              height="1003"
              [alt]="screen.alt"
              loading="lazy"
              class="proof-img proof-img-light"
            />
            <img
              [src]="'screenshots/' + screen.name + '-dark.webp'"
              width="1600"
              height="1003"
              alt=""
              aria-hidden="true"
              loading="lazy"
              class="proof-img proof-img-dark"
            />
          </figure>
        }
      </div>
    </section>
  `,
})
export class FeatureStripComponent {
  protected readonly points = PROOF_POINTS;
  protected readonly screens = SCREENS;
}
