/**
 * Amianto Editor — dialoghi compatibili con Electron.
 * window.prompt / window.confirm non funzionano nel renderer Electron.
 */
(function (root) {
  'use strict';

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function canUseNativePrompt() {
    return !root.AMIANTO_IS_ELECTRON && typeof root.prompt === 'function';
  }

  function canUseNativeConfirm() {
    return !root.AMIANTO_IS_ELECTRON && typeof root.confirm === 'function';
  }

  function showBootstrapModal(modal) {
    return new Promise((resolve) => {
      document.body.appendChild(modal);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          const inst = bootstrap.Modal.getInstance(modal);
          if (inst) inst.hide();
          else modal.remove();
        } else {
          modal.remove();
        }
      };

      modal.addEventListener('hidden.bs.modal', () => {
        if (!settled) finish(null);
        modal.remove();
      });

      modal._amiantoFinish = finish;

      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
      } else {
        // Nessun Bootstrap: il caller usa fallback native; non lasciare la Promise appesa
        setTimeout(() => finish(null), 0);
      }
    });
  }

  /**
   * @returns {Promise<string|null>} null = annullato
   */
  function showInputPrompt({ title = 'Input', message = '', defaultValue = '', okLabel = 'OK' } = {}) {
    if (canUseNativePrompt()) {
      const result = root.prompt(message || title, defaultValue == null ? '' : String(defaultValue));
      return Promise.resolve(result === null ? null : result);
    }

    const modalId = `amianto-input-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const inputId = `${modalId}-field`;
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = modalId;
    modal.setAttribute('tabindex', '-1');
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-light border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">${esc(title)}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            ${message ? `<label class="form-label text-light" for="${inputId}">${esc(message)}</label>` : ''}
            <input type="text" class="form-control bg-secondary text-light border-secondary" id="${inputId}" value="">
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-success btn-sm" id="${modalId}-ok">${esc(okLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const p = showBootstrapModal(modal);
    const input = modal.querySelector(`#${inputId}`);
    const okBtn = modal.querySelector(`#${modalId}-ok`);
    if (input) input.value = defaultValue == null ? '' : String(defaultValue);

    if (okBtn) {
      okBtn.addEventListener('click', () => modal._amiantoFinish(input ? input.value : ''));
    }
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          modal._amiantoFinish(input.value);
        }
      });
      setTimeout(() => {
        input.focus();
        input.select();
      }, 150);
    }

    // Se Bootstrap non c'è, fallback native
    if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
      if (canUseNativePrompt()) {
        return Promise.resolve(root.prompt(message || title, defaultValue == null ? '' : String(defaultValue)));
      }
    }

    return p.then((v) => (v === undefined ? null : v));
  }

  /**
   * @returns {Promise<boolean>}
   */
  function showConfirmDialog({ title = 'Confirm', message = '', okLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
    if (canUseNativeConfirm()) {
      return Promise.resolve(!!root.confirm(message || title));
    }

    const modalId = `amianto-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = modalId;
    modal.setAttribute('tabindex', '-1');
    const okClass = danger ? 'btn-danger' : 'btn-success';
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-light border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">${esc(title)}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="mb-0" style="white-space: pre-wrap;">${esc(message || title)}</p>
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${esc(cancelLabel)}</button>
            <button type="button" class="btn ${okClass} btn-sm" id="${modalId}-ok">${esc(okLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const p = showBootstrapModal(modal);
    const okBtn = modal.querySelector(`#${modalId}-ok`);
    if (okBtn) {
      okBtn.addEventListener('click', () => modal._amiantoFinish(true));
    }
    // Cancel / X → null from hidden handler; map to false
    return p.then((v) => v === true);
  }

  /**
   * Scelta da elenco (select).
   * @param {{ title?: string, message?: string, options: Array<{value:string,label:string}>, defaultValue?: string, okLabel?: string }} opts
   * @returns {Promise<string|null>}
   */
  function showChoicePrompt({ title = 'Choose', message = '', options = [], defaultValue = '', okLabel = 'OK' } = {}) {
    const opts = Array.isArray(options) ? options : [];
    if (!opts.length) return Promise.resolve(null);

    if (canUseNativePrompt()) {
      const labels = opts.map((o) => o.value).join('/');
      const result = root.prompt(message || `${title} (${labels})`, defaultValue || opts[0].value);
      if (result === null) return Promise.resolve(null);
      const match = opts.find((o) => o.value === result || o.label === result);
      return Promise.resolve(match ? match.value : result);
    }

    const modalId = `amianto-choice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const selectId = `${modalId}-select`;
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = modalId;
    modal.setAttribute('tabindex', '-1');
    const optionsHtml = opts.map((o) =>
      `<option value="${esc(o.value)}"${(defaultValue || opts[0].value) === o.value ? ' selected' : ''}>${esc(o.label || o.value)}</option>`
    ).join('');
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-light border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">${esc(title)}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            ${message ? `<label class="form-label text-light" for="${selectId}">${esc(message)}</label>` : ''}
            <select class="form-select bg-secondary text-light border-secondary" id="${selectId}">${optionsHtml}</select>
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-success btn-sm" id="${modalId}-ok">${esc(okLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const p = showBootstrapModal(modal);
    const select = modal.querySelector(`#${selectId}`);
    const okBtn = modal.querySelector(`#${modalId}-ok`);
    if (okBtn) {
      okBtn.addEventListener('click', () => modal._amiantoFinish(select ? select.value : null));
    }
    setTimeout(() => { if (select) select.focus(); }, 150);
    return p.then((v) => (v === undefined || v === null ? null : v));
  }

  /**
   * Form variabile: name + type + initial value.
   * @returns {Promise<{name:string,type:string,initialValue:*}|null>}
   */
  function showVariableFormDialog({
    title = 'Variable',
    name = '',
    type = 'boolean',
    initialValue = false
  } = {}) {
    const modalId = `amianto-var-form-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nameId = `${modalId}-name`;
    const typeId = `${modalId}-type`;
    const valueId = `${modalId}-value`;
    const boolId = `${modalId}-bool`;
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = modalId;
    modal.setAttribute('tabindex', '-1');

    const initType = ['boolean', 'number', 'string'].includes(type) ? type : 'boolean';
    let initStr = '';
    if (initType === 'boolean') initStr = initialValue ? 'true' : 'false';
    else if (initType === 'number') initStr = String(Number(initialValue) || 0);
    else initStr = initialValue == null ? '' : String(initialValue);

    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-light border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">${esc(title)}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label text-light" for="${nameId}">Name</label>
              <input type="text" class="form-control bg-secondary text-light border-secondary" id="${nameId}" value="${esc(name)}">
            </div>
            <div class="mb-3">
              <label class="form-label text-light" for="${typeId}">Type</label>
              <select class="form-select bg-secondary text-light border-secondary" id="${typeId}">
                <option value="boolean"${initType === 'boolean' ? ' selected' : ''}>boolean</option>
                <option value="number"${initType === 'number' ? ' selected' : ''}>number</option>
                <option value="string"${initType === 'string' ? ' selected' : ''}>string</option>
              </select>
            </div>
            <div class="mb-0" id="${modalId}-value-wrap">
              <label class="form-label text-light" for="${valueId}">Initial value</label>
              <div id="${modalId}-bool-wrap" class="form-check"${initType === 'boolean' ? '' : ' style="display:none"'}>
                <input class="form-check-input" type="checkbox" id="${boolId}"${initType === 'boolean' && initialValue ? ' checked' : ''}>
                <label class="form-check-label text-light" for="${boolId}">true</label>
              </div>
              <input type="text" class="form-control bg-secondary text-light border-secondary" id="${valueId}" value="${esc(initStr)}"${initType === 'boolean' ? ' style="display:none"' : ''}>
            </div>
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-success btn-sm" id="${modalId}-ok">OK</button>
          </div>
        </div>
      </div>
    `;

    const p = showBootstrapModal(modal);
    const nameInput = modal.querySelector(`#${nameId}`);
    const typeSelect = modal.querySelector(`#${typeId}`);
    const valueInput = modal.querySelector(`#${valueId}`);
    const boolInput = modal.querySelector(`#${boolId}`);
    const boolWrap = modal.querySelector(`#${modalId}-bool-wrap`);
    const okBtn = modal.querySelector(`#${modalId}-ok`);

    function syncValueUi() {
      const t = typeSelect.value;
      if (t === 'boolean') {
        if (boolWrap) boolWrap.style.display = '';
        if (valueInput) valueInput.style.display = 'none';
      } else {
        if (boolWrap) boolWrap.style.display = 'none';
        if (valueInput) {
          valueInput.style.display = '';
          valueInput.type = t === 'number' ? 'number' : 'text';
        }
      }
    }
    if (typeSelect) typeSelect.addEventListener('change', syncValueUi);

    function collect() {
      const n = nameInput ? String(nameInput.value || '').trim() : '';
      const t = typeSelect ? typeSelect.value : 'boolean';
      let v;
      if (t === 'boolean') v = !!(boolInput && boolInput.checked);
      else if (t === 'number') v = Number(valueInput && valueInput.value) || 0;
      else v = valueInput ? String(valueInput.value || '') : '';
      return { name: n, type: t, initialValue: v };
    }

    if (okBtn) {
      okBtn.addEventListener('click', () => {
        const data = collect();
        if (!data.name) {
          if (nameInput) {
            nameInput.focus();
            nameInput.classList.add('is-invalid');
          }
          return;
        }
        modal._amiantoFinish(data);
      });
    }
    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          okBtn && okBtn.click();
        }
      });
      setTimeout(() => {
        nameInput.focus();
        nameInput.select();
      }, 150);
    }

    return p.then((v) => (v && typeof v === 'object' ? v : null));
  }

  root.showInputPrompt = showInputPrompt;
  root.showConfirmDialog = showConfirmDialog;
  root.showChoicePrompt = showChoicePrompt;
  root.showVariableFormDialog = showVariableFormDialog;

  console.log('[EditorDialogs] ready (Electron-safe prompts)');
})(typeof window !== 'undefined' ? window : globalThis);
