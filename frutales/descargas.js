(() => {
  const endpoint='https://je8fwbkk.eu-central.insforge.app/functions/frutales-delivery?action=download';
  const token=new URLSearchParams(location.hash.slice(1)).get('token');
  const status=document.getElementById('status');
  const buttons=[...document.querySelectorAll('[data-file]')];
  if(!/^[0-9a-f]{64}$/.test(token||'')){document.getElementById('files').hidden=true;document.getElementById('files').style.display='none';status.textContent='Este enlace no contiene un acceso válido. Abre el enlace completo de tu correo.';return;}
  for(const button of buttons)button.addEventListener('click',async()=>{
    buttons.forEach(b=>b.disabled=true);status.textContent='Preparando el archivo. La guía puede tardar unos segundos.';
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,file:button.dataset.file}),cache:'no-store'});
      if(!response.ok){const data=await response.json();throw new Error(data.error||'No se pudo descargar el archivo.');}
      if(!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('Respuesta de descarga no válida.');
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||button.dataset.file;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent='Descarga preparada. Puedes descargar los demás archivos.';
    }catch(error){status.textContent=error.message||'No se pudo descargar el archivo. Inténtalo de nuevo.';}
    finally{buttons.forEach(b=>b.disabled=false);}
  });
})();
