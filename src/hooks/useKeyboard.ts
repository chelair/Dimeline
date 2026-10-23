import { useEffect } from 'react';
import { useEditor } from '../store/editorStore';
import { newProject, openProject, saveProject } from '../services/desktopService';
export function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
  );
}
export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing || isEditing(e.target)) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        void saveProject(e.shiftKey);
      } else if (mod && key === 'o') {
        e.preventDefault();
        void openProject();
      } else if (mod && key === 'n') {
        e.preventDefault();
        void newProject();
      } else if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        s.duplicate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.remove();
      } else if (e.key === 'Escape') {
        if (s.transaction) s.cancel();
        else s.select(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
