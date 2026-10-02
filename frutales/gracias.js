(() => {
  const endpoint = 'https://je8fwbkk.eu-central.insforge.app/functions/frutales-delivery?action=session';
  const id = new URL(location.href).searchParams.get('session_id');
  const status = document.getElementById('status');
  const receipt = document.getElementById('tu-acceso');
  const title = document.getElementById('receipt-title');
  const symbol = document.getElementById('receipt-symbol');
  const retry = document.getElementById('retry');
  let running = false;
  // Keep the Stripe bearer identifier out of history and referral URLs.
  if (new URL(location.href).searchParams.has('session_id')) history.replaceState(null, '', location.pathname);
  function state(kind, heading, message) {
    receipt.dataset.state = kind;
    receipt.setAttribute('aria-busy', String(kind === 'loading'));
    title.textContent = heading;
    status.textContent = message;
    symbol.textContent = kind === 'ready' ? '✓' : kind === 'loading' ? '↻' : '!';
  }
  if (!/^cs_live_[A-Za-z0-9]{20,200}$/.test(id || '')) {
    state('error', 'Abre tu enlace de acceso personal.', 'No encontramos una sesión de compra válida en esta página. Abre el enlace de tu correo de entrega o contacta con Capnodis para recuperar el acceso.');
    return;
  }
  async function check() {
    if (running) return;
    running = true; retry.hidden = true; retry.disabled = true;
    state('loading', 'Estamos preparando tu biblioteca.', 'Estamos comprobando tu compra y preparando el acceso a tus cuatro archivos PDF.');
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({session_id:id}), cache:'no-store', signal:AbortSignal.timeout(10000)});
          const data = await response.json();
          if (response.ok && /^[0-9a-f]{64}$/.test(data.token || '')) {
            document.getElementById('download-link').href = 'descargas#token=' + data.token;
            document.getElementById('access').hidden = false;
            state('ready', 'Tu compra está confirmada.', 'Tu guía y los tres bonos están listos. Abre tu biblioteca y guarda los archivos en tu dispositivo.');
            return;
          }
          if ([400,403,410].includes(response.status)) {
            state('error', 'Vamos a ayudarte con el acceso.', data.error || 'No pudimos verificar el acceso. Contacta con Capnodis con el correo de tu pedido.');
            return;
          }
        } catch (_) { /* Recover transient network errors within the bounded retry loop. */ }
        if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 2500));
      }
      state('error', 'Tu acceso aún se está preparando.', 'Puedes volver a comprobar el acceso. Si no recibes el correo de entrega, contacta con nosotros; no necesitas repetir la compra.');
      retry.hidden = false;
    } finally { running = false; retry.disabled = false; }
  }
  retry.addEventListener('click', check);
  check();
})();
