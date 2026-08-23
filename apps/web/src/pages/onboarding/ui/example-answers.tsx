interface Props {
  onPick: (example: string) => void;
}

/**
 * What an answer can look like, in the shape the conversation actually takes
 * them — UC-1.5. Picking one fills the composer rather than sending it: the
 * point is to show that a sentence is enough, not to answer for the user.
 */
const EXAMPLES = [
  '18k, always on the 5th',
  'the 5th, moving back off a weekend',
  'health plan 320 on the 8th',
];

export function ExampleAnswers({ onPick }: Props) {
  return (
    <ul aria-label="Example answers" className="flex flex-wrap gap-2">
      {EXAMPLES.map((example) => (
        <li key={example}>
          <button
            type="button"
            onClick={() => {
              onPick(example);
            }}
            className="cursor-pointer rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            {example}
          </button>
        </li>
      ))}
    </ul>
  );
}
