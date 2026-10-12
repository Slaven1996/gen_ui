import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AlarmDetail } from './alarm-detail';

/** An alarm's details in a side sheet, opened by id; closing clears the id. */
export function AlarmDetailSheet({ alarmId, onClose }: { alarmId: string | undefined; onClose: () => void }) {
  return (
    <Sheet open={Boolean(alarmId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {alarmId && <AlarmDetail alarmId={alarmId} />}
      </SheetContent>
    </Sheet>
  );
}
