import { useCallback, useEffect, useState } from 'react';
import { getReview, type ReviewRecord } from '@/api/moderation';
import { reviewCommandLabels } from '@/components/moderation-labels';

type Watch =
  | { kind: 'command'; id: string }
  | { kind: 'version'; id: string; versionNo: number };

interface ReadState {
  revision: number;
  response?: ReviewRecord;
  watch?: Watch;
  error?: unknown;
  timedOut?: boolean;
  outcome?: { text: string; failed: boolean; requiresRefresh?: boolean };
}

export function useReviewDetail(id: string) {
  const [request, setRequest] = useState<{ revision: number; watch?: Watch }>({ revision: 0 });
  const [state, setState] = useState<ReadState>({ revision: -1 });
  const reload = useCallback((watch?: Watch) => {
    setRequest((previous) => ({ revision: previous.revision + 1, watch }));
  }, []);

  useEffect(() => {
    const { revision } = request;
    const controller = new AbortController();
    let watch = request.watch;
    let nextRead: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => {
      controller.abort();
      clearTimeout(nextRead);
      setState((previous) => ({ ...previous, revision, watch, error: undefined, timedOut: true }));
    }, 60_000);

    async function read() {
      try {
        const response = await getReview(id, controller.signal);
        if (controller.signal.aborted) return;

        let outcome: ReadState['outcome'];
        if (watch?.kind === 'version') {
          if (response.data.versionId === watch.id) {
            outcome = { text: `Версия №${watch.versionNo} получена. Возьмите её в работу, чтобы принять решение.`, failed: false };
            watch = undefined;
          } else if ((response.data.versionNo ?? 0) >= watch.versionNo) {
            outcome = { text: 'Ожидаемая исправленная версия больше не является текущей. Обновите проверку и сверьте полученную версию.', failed: true, requiresRefresh: true };
            watch = undefined;
          }
        } else if (watch?.kind === 'command') {
          const commandId = watch.id;
          const command = response.data.commands.find((entry) => entry.id === commandId);
          if (command && command.state !== 'PENDING') {
            const failure = command.failure ? `: ${command.failure}` : '';
            outcome = {
              text: `Команда для версии №${command.versionNo}: ${reviewCommandLabels[command.state]}${failure}.`,
              failed: command.state !== 'CONFIRMED',
            };
            watch = undefined;
          }
        }
        if (!watch && response.data.pendingCommandId && !outcome?.requiresRefresh) {
          watch = { kind: 'command', id: response.data.pendingCommandId };
        }

        const pending = watch;
        setState((previous) => ({ revision, response, watch: pending, outcome: outcome ?? (previous.revision === revision ? previous.outcome : undefined) }));
        if (pending) nextRead = setTimeout(read, 2_000);
        else clearTimeout(deadline);
      } catch (error) {
        if (controller.signal.aborted) return;
        clearTimeout(deadline);
        setState((previous) => ({ ...previous, revision, watch, error, timedOut: false }));
      }
    }

    void read();
    return () => {
      controller.abort();
      clearTimeout(nextRead);
      clearTimeout(deadline);
    };
  }, [id, request]);

  const loading = state.revision !== request.revision;
  return { ...state, loading, revision: request.revision, watch: loading ? request.watch : state.watch, reload };
}
