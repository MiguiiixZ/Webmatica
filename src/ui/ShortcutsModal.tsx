import { S } from './strings';

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={S.shortcuts}>
        <h3>{S.shortcuts}</h3>
        <div class="shortcuts">
          {S.shortcutList.map(([k, d]) => (
            <>
              <div>
                {k.split(' / ').map((part, i) => (
                  <>
                    {i > 0 && ' / '}
                    <kbd>{part}</kbd>
                  </>
                ))}
              </div>
              <div class="muted">{d}</div>
            </>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button class="btn" onClick={onClose}>
            {S.close}
          </button>
        </div>
      </div>
    </div>
  );
}
