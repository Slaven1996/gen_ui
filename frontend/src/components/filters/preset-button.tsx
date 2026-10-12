import { Button } from '@/components/ui/button';

/** One preset in the time range popover. */
export function PresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant={active ? 'secondary' : 'ghost'} size="sm" className="justify-start font-normal" onClick={onClick}>
      {children}
    </Button>
  );
}
