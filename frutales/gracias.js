(() => {
  const endpoint='https://je8fwbkk.eu-central.insforge.app/functions/frutales-delivery?action=session';
  const id=new URL(location.href).searchParams.get('session_id');
  const status=document.getElementById('status');
  if(!/^cs_live_[A-Za-z0-9]{20,200}$/.test(id||'')){status.textContent='No encontramos una sesión de pago válida. Abre el enlace de tu correo o contacta con nosotros.';return;}
  // Remove the payment bearer identifier from browser history after reading it.
  history.replaceState(null,'',location.pathname);
  async function check(){
    for(let attempt=0;attempt<12;attempt++){
      try{
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:id}),cache:'no-store'});
        const data=await response.json();
        if(response.ok&&/^[0-9a-f]{64}$/.test(data.token||'')){
          document.getElementById('download-link').href='descargas#token='+data.token;
          document.getElementById('access').hidden=false;
          status.textContent='Tu guía y los tres bonos están listos.';return;
        }
        if(response.status===403||response.status===410){status.textContent=data.error;return;}
      }catch(_){/* A transient failure can recover on the next attempt. */}
      await new Promise(resolve=>setTimeout(resolve,2500));
    }
    status.textContent='Tu acceso aún se está preparando. Revisa el correo o contacta con nosotros si no recibes el enlace.';
  }
  check();
})();
