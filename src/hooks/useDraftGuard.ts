import { useEffect, useId } from 'react';
import { useEditor } from '../store/editorStore';
export function useDraftGuard() {
  const id = useId();
  const set = (changed: boolean) =>
    useEditor.setState((s) => ({ drafts: { ...s.drafts, [id]: changed } }));
  useEffect(
    () => () => {
      useEditor.setState((s) => {
        const drafts = { ...s.drafts };
        delete drafts[id];
        return { drafts };
      });
    },
    [id],
  );
  return set;
}
