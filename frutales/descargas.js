(() => {
  const endpoint='https://je8fwbkk.eu-central.insforge.app/functions/frutales-delivery?action=download';
  const token=new URLSearchParams(location.hash.slice(1)).get('token');
  const status=document.getElementById('status');
  const buttons=[...document.querySelectorAll('[data-file]')];
  if(!/^[0-9a-f]{64}$/.test(token||'')){document.getElementById('files').hidden=true;status.dataset.state='error';status.textContent='Este enlace no contiene un acceso válido. Abre el enlace completo de tu correo de entrega o contacta con nosotros.';return;}
  for(const button of buttons)button.addEventListener('click',async()=>{
    const label=button.querySelector('.button-label'),original=label.textContent;
    buttons.forEach(b=>b.disabled=true);button.classList.add('is-loading');button.setAttribute('aria-busy','true');label.textContent='Preparando…';status.dataset.state='loading';status.textContent='Preparando el archivo. Espera unos segundos sin cerrar esta página.';
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,file:button.dataset.file}),cache:'no-store'});
      if(!response.ok){const data=await response.json();throw new Error(data.error||'No se pudo descargar el archivo.');}
      if(!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('Respuesta de descarga no válida.');
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||button.dataset.file;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      button.classList.add('is-done');status.dataset.state='success';status.textContent='Archivo preparado. Busca el PDF en Descargas o Archivos; si se abre una vista previa, utiliza la opción de guardar o compartir.';
    }catch(error){status.dataset.state='error';status.textContent=error.message||'No se pudo descargar el archivo. Inténtalo de nuevo.';}
    finally{buttons.forEach(b=>b.disabled=false);button.classList.remove('is-loading');button.removeAttribute('aria-busy');label.textContent=original;}
  });
})();
