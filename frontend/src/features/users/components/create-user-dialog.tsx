import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { CreateUserForm } from './create-user-form';

/** The Users page's "Add user" button and its dialog. */
export function CreateUserDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {/* Closing unmounts the form, so it opens empty next time. */}
        <CreateUserForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
