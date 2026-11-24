// Pure helpers shared by the map traffic-notice renderer.
// Extracted unchanged from app.js; loaded before app.js as a classic script.
function safeTrafficText(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function trafficKind(event){
  const message=String(event?.message||'').toLowerCase();
  const type=String(event?.type||'').toLowerCase();
  const validity=String(event?.validity||'').toLowerCase();
  const now=Date.now();
  const started=event?.start?Date.parse(event.start):NaN;
  const ended=event?.end?Date.parse(event.end):NaN;
  // Red is reserved for explicit closures with a currently valid time window.
  const confirmed=validity==='active' && (!Number.isFinite(started)||started<=now) &&
    (!Number.isFinite(ended)||ended>=now);
  if(confirmed && /(?:stengt|stengning|closed|road\s*closed)/i.test(message))return 'closed';
  if(/(?:veg(?:-| )?arbeid|veiarbeid|diriger|vedlikehold)/i.test(message) ||
     /maintenance|roadworks/i.test(type))return 'work';
  return 'info';
}
function formatDatexDate(value){
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return String(value||'');
 return new Intl.DateTimeFormat('nb-NO',{
  day:'numeric',month:'long',year:'numeric',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Europe/Oslo'
 }).format(date).replace(' kl. ', ' kl. ');
}
