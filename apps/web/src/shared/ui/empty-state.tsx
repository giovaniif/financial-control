interface Props {
  title: string;
  body: string;
}

/**
 * The app ships with no data and has no import path, so an empty screen is a
 * normal state that has to say what to do next — never a blank panel.
 */
export function EmptyState({ title, body }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}
