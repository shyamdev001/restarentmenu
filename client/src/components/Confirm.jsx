import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A styled "are you sure?" for things that cannot be undone.
 *
 *   const [confirm, dialog] = useConfirm();
 *   if (await confirm({ title: 'Delete this dish?', body: '…', action: 'Delete' })) { … }
 *   return <>…{dialog}</>;
 *
 * Built on the browser's own <dialog>, so focus stays inside it, Escape cancels,
 * and the page behind cannot be clicked.
 */
export function useConfirm() {
  const [request, setRequest] = useState(null);

  const confirm = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);
  const answer = (yes) => { request?.resolve(yes); setRequest(null); };

  return [confirm, request && <ConfirmDialog {...request} onAnswer={answer} />];
}

function ConfirmDialog({ title, body, action = 'Confirm', cancel = 'Keep it', onAnswer }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => { if (el?.open) el.close(); };
  }, []);

  return (
    <dialog ref={ref} className="a-confirm" role="alertdialog" aria-labelledby="a-confirm-title" data-lenis-prevent
      onCancel={(e) => { e.preventDefault(); onAnswer(false); }}
      onClick={(e) => { if (e.target === ref.current) onAnswer(false); }}>
      <div className="a-confirm__box">
        <h2 id="a-confirm-title">{title}</h2>
        {body && <p>{body}</p>}
        <div className="a-confirm__row">
          {/* The safe choice is focused first, so Enter never destroys anything by accident. */}
          <button type="button" className="a-btn" autoFocus onClick={() => onAnswer(false)}>{cancel}</button>
          <button type="button" className="a-btn is-danger is-solid" onClick={() => onAnswer(true)}>{action}</button>
        </div>
      </div>
    </dialog>
  );
}
