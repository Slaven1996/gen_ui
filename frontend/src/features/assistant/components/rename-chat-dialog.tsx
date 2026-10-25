import { useId, useState, type FormEvent } from 'react';
import { CONVERSATION_TITLE_MAX, type ConversationSummary } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRenameConversation } from '../api/mutations';

/** Gives a chat a title of the user's own. Mount it per chat (`key`), so it starts from that chat's title. */
export function RenameChatDialog({
  chat,
  onOpenChange,
}: {
  chat: ConversationSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(chat?.title ?? '');
  const rename = useRenameConversation();
  const inputId = useId();
  const trimmed = title.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!chat || !trimmed) return;
    if (trimmed === chat.title) {
      onOpenChange(false);
      return;
    }
    rename.mutate({ id: chat.id, title: trimmed }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={chat !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>The name it has in your list of chats.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>Name</Label>
            <Input
              id={inputId}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={CONVERSATION_TITLE_MAX}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={rename.isPending || !trimmed}>
              {rename.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
