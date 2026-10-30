// EmDash 1.3.1's native “View Site” header link points to /. Keep its label and
// normal new-tab behavior, but direct it through the authenticated handoff.
document.addEventListener('click',(event)=>{
 if(!location.pathname.startsWith('/_emdash/admin'))return;
 const link=(event.target as Element|null)?.closest<HTMLAnchorElement>('header a[href="/"]');
 if(link)link.href='/_emdash/api/customseda/preview';
},true);
