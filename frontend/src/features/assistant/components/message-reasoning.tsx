
/** The model's reasoning, folded under a toggle. */
export function MessageReasoning({ text }: { text: string }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">Reasoning</summary>
      <div className="mt-2 border-l pl-3 whitespace-pre-wrap">{text}</div>
    </details>
  );
}
