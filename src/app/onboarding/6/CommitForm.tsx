'use client';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { useState, useTransition, type FormEvent } from 'react';

import { StepBackLink } from '../StepBackLink';
import { commitAction } from './actions';
import { INITIAL_COMMIT_STEP_STATE, type CommitStepState } from './state';

export function CommitForm() {
  const [state, setState] = useState<CommitStepState>(INITIAL_COMMIT_STEP_STATE);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(() => {
      void commitAction().then(setState);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {state.message ? (
        <Notice role="alert" variant="error">
          {state.message}
        </Notice>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StepBackLink href="/onboarding/5" />
        <Button className="w-full sm:w-auto" type="submit" disabled={isPending}>
          {isPending ? 'Vytvářím...' : 'Dokončit a vytvořit profil'}
        </Button>
      </div>
    </form>
  );
}
