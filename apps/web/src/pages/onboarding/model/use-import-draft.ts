import type {
  AccountType,
  AnchorChangeRequest,
  BucketMode,
  ImportAnswers,
  SpreadsheetReading,
} from '@fin/contracts';
import { useCallback, useState } from 'react';

import { parseBRL } from '@/shared/lib';

export interface DraftAccount {
  name: string;
  type: AccountType;
  balance: string;
}

export interface DraftCard {
  closingDay: string;
  dueDay: string;
  limit: string;
  paymentAccountName: string;
}

export interface DraftBucket {
  mode: BucketMode;
  target: string;
  targetDate: string;
  seedBalance: string;
}

export interface ImportDraft {
  accounts: DraftAccount[];
  /** Which outcome labels are credit cards rather than bills. */
  cardLabels: string[];
  cards: Record<string, DraftCard>;
  dueDays: Record<string, string>;
  estimates: string[];
  buckets: Record<string, DraftBucket>;
}

export interface ImportDraftHandle {
  draft: ImportDraft;
  update: (change: Partial<ImportDraft>) => void;
  toggleCard: (label: string) => void;
  toggleEstimate: (label: string) => void;
  setDueDay: (label: string, day: string) => void;
  setCard: (label: string, change: Partial<DraftCard>) => void;
  setBucket: (name: string, change: Partial<DraftBucket>) => void;
}

const EMPTY: ImportDraft = {
  accounts: [],
  cardLabels: [],
  cards: {},
  dueDays: {},
  estimates: [],
  buckets: {},
};

/**
 * Everything the spreadsheet could not say, collected across the wizard.
 *
 * In import mode the steps gather rather than create: applying the import runs
 * a restore, which replaces the whole dataset, so anything written on the way
 * through would be wiped by the last step.
 */
export function useImportDraft(): ImportDraftHandle {
  const [draft, setDraft] = useState<ImportDraft>(EMPTY);

  const update = useCallback((change: Partial<ImportDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
  }, []);

  const toggle = useCallback(
    (key: 'cardLabels' | 'estimates', label: string) => {
      setDraft((current) => ({
        ...current,
        [key]: current[key].includes(label)
          ? current[key].filter((each) => each !== label)
          : [...current[key], label],
      }));
    },
    [],
  );

  return {
    draft,
    update,
    toggleCard: useCallback(
      (label: string) => {
        toggle('cardLabels', label);
      },
      [toggle],
    ),
    toggleEstimate: useCallback(
      (label: string) => {
        toggle('estimates', label);
      },
      [toggle],
    ),
    setDueDay: useCallback((label: string, day: string) => {
      setDraft((current) => ({
        ...current,
        dueDays: { ...current.dueDays, [label]: day },
      }));
    }, []),
    setCard: useCallback((label: string, change: Partial<DraftCard>) => {
      setDraft((current) => ({
        ...current,
        cards: {
          ...current.cards,
          [label]: { ...blankCard(), ...current.cards[label], ...change },
        },
      }));
    }, []),
    setBucket: useCallback((name: string, change: Partial<DraftBucket>) => {
      setDraft((current) => ({
        ...current,
        buckets: {
          ...current.buckets,
          [name]: { ...blankBucket(), ...current.buckets[name], ...change },
        },
      }));
    }, []),
  };
}

export function blankCard(): DraftCard {
  return { closingDay: '28', dueDay: '10', limit: '', paymentAccountName: '' };
}

export function blankBucket(): DraftBucket {
  return { mode: 'ONGOING', target: '', targetDate: '', seedBalance: '' };
}

/** The first cycle the app's rolling window still holds. */
function firstImportableMonth(reading: SpreadsheetReading): string {
  const filled = reading.months.filter((month) => !month.isBlank);

  return filled[0]?.month ?? reading.months[0]?.month ?? '';
}

/** The draft as the API wants it: cents, numbers, and no blank strings. */
export function toImportAnswers(
  draft: ImportDraft,
  anchor: AnchorChangeRequest,
  reading: SpreadsheetReading,
  fromMonth?: string,
): ImportAnswers {
  return {
    anchor,
    accounts: draft.accounts.map((account) => ({
      name: account.name.trim(),
      type: account.type,
      balance: parseBRL(account.balance) ?? 0,
    })),
    cards: draft.cardLabels.map((label) => {
      const card = draft.cards[label] ?? blankCard();

      return {
        label,
        closingDay: Number(card.closingDay),
        dueDay: Number(card.dueDay),
        limit: Math.abs(parseBRL(card.limit) ?? 0),
        paymentAccountName:
          card.paymentAccountName === ''
            ? (draft.accounts[0]?.name.trim() ?? '')
            : card.paymentAccountName,
      };
    }),
    dueDays: Object.fromEntries(
      Object.entries(draft.dueDays)
        .filter(([, day]) => day !== '')
        .map(([label, day]) => [label, Number(day)]),
    ),
    estimates: draft.estimates,
    buckets: reading.buckets.map((bucket, index) => {
      const answer = draft.buckets[bucket.name] ?? blankBucket();
      const target = parseBRL(answer.target);
      const seed = parseBRL(answer.seedBalance);

      return {
        name: bucket.name,
        mode: answer.mode,
        priority: index + 1,
        ...(answer.mode === 'GOAL' && target !== null ? { target } : {}),
        ...(answer.mode === 'GOAL' && answer.targetDate !== ''
          ? { targetDate: answer.targetDate }
          : {}),
        ...(seed === null
          ? bucket.latestBalance === null
            ? {}
            : { seedBalance: bucket.latestBalance }
          : { seedBalance: seed }),
      };
    }),
    fromMonth: fromMonth ?? firstImportableMonth(reading),
  };
}
