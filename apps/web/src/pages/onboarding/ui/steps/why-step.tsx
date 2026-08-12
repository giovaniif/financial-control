const questions = [
  {
    id: 'q1',
    question:
      "It's the middle of the month. How much will I pay in the next cycle, and how much will be left when I'm next paid?",
    answer:
      'The Dashboard answers this in one sentence — with the actual dates money leaves the account, not an average monthly spend.',
  },
  {
    id: 'q2',
    question: 'What does my future look like?',
    answer:
      'The Wealth Projection answers this — where your current saving rate lands in 5, 10, 20 and 30 years, and whether each goal will be met on time.',
  },
];

/** UC-1.5 — the two questions everything else on the screen is evidence for. */
export function WhyStep() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-zinc-600">
        This app replaces a spreadsheet, and it exists to answer two questions.
        Everything in it is subordinate to one or the other.
      </p>

      <ol className="flex flex-col gap-4">
        {questions.map((item, index) => (
          <li
            key={item.id}
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
              Question {index + 1}
            </p>
            <p className="mt-2 font-medium text-zinc-900">
              &ldquo;{item.question}&rdquo;
            </p>
            <p className="mt-2 text-sm text-zinc-600">{item.answer}</p>
          </li>
        ))}
      </ol>

      <p className="text-sm text-zinc-600">
        The next few steps set the app up to answer them. Each one explains an
        idea and then asks you for the part only you know — it should take a few
        minutes.
      </p>
    </div>
  );
}
