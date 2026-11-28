// EKODI contacts: deterministic, read-only proposals; no provider writes.
const clean = v => String(v ?? '').normalize('NFC').trim();
const nameKey = v => clean(v).replace(/\s+/g,'').toLowerCase();
const titles = new Set(['목사','전도사','장로','권사','집사','대표','회장','교수','선생님','사무국장','팀장','부장','과장']);
export function nameProposal(person) {
  const names = person.names || [];
  if (names.length !== 1) return null;
  const original = clean(names[0].displayName || names[0].unstructuredName);
  // Only suggest an explicit delimiter after a plausible Korean full name.
  const m = original.match(/^([가-힣]{2,4})\s*[.·ㆍ,，]{1,4}\s*([^.,·ㆍ，]+)$/u);
  if (!m) return null;
  const suffix = clean(m[2]);
  if (!suffix || /^\d+$/.test(suffix)) return null;
  const field = titles.has(suffix) ? 'title' : 'organization';
  const orgs = person.organizations || [];
  if (orgs.length > 1 || orgs.some(o => clean(field === 'title' ? o.title : o.name) && clean(field === 'title' ? o.title : o.name) !== suffix)) {
    return {id: person.resourceName, original, proposedName:m[1], field, value:suffix, status:'review_conflict'};
  }
  return {id:person.resourceName, original, proposedName:m[1], field, value:suffix, status:'review_required'};
}
function phoneKey(value) {
  const input = clean(value);
  if (!/^\+?[\d\s()-]+$/.test(input)) return '';
  let n=input.replace(/\D/g,'');
  if (input.startsWith('+82')) n='0'+n.slice(2);
  else if (n.startsWith('0082')) n='0'+n.slice(4);
  return /^0\d{8,10}$/.test(n) ? n : input.startsWith('+') && n.length>=8 && n.length<=15 ? '+'+n : '';
}
function keys(p) {
  return [...new Set([
    ...(p.emailAddresses || []).map(e=>clean(e.value).toLowerCase()).filter(v=>/^[^\s@]+@[^\s@]+$/.test(v)).map(v=>'e:'+v),
    ...(p.phoneNumbers || []).map(e=>phoneKey(e.canonicalForm || e.value)).filter(Boolean).map(v=>'p:'+v)
  ])];
}
function personName(p) {
  const proposal = nameProposal(p);
  return nameKey(proposal?.proposedName || p.names?.[0]?.displayName || p.names?.[0]?.unstructuredName);
}
export function analyzeContacts(people) {
  if (!Array.isArray(people)) throw new TypeError('CONTACTS_REQUIRED');
  const index = new Map(), seen = new Set(), pairs = new Map(), proposals=[];
  for (const p of people) {
    if (!/^people\/c[\w-]+$/.test(p.resourceName || '') || seen.has(p.resourceName)) throw new Error('INVALID_OR_DUPLICATE_RESOURCE');
    seen.add(p.resourceName);
    const proposal = nameProposal(p);
    if (proposal) proposals.push(proposal);
    for (const k of keys(p)) {
      if (!index.has(k)) index.set(k,[]);
      index.get(k).push(p);
    }
  }
  const shared = [];
  for (const [k, group] of index) {
    if(group.length < 2) continue;
    // Shared numbers or mailboxes must never produce a transitive merge.
    if(group.length > 2) { shared.push({ids:group.map(p=>p.resourceName).sort(),type:k[0],status:'review_shared_identifier'}); continue; }
    const [a,b]=[...group].sort((x,y)=>x.resourceName.localeCompare(y.resourceName));
    const id=a.resourceName+'|'+b.resourceName;
    const match=pairs.get(id)||{ids:[a.resourceName,b.resourceName],sameName:Boolean(personName(a)&&personName(a)===personName(b)),evidence:[],status:'review_required'};
    if(!match.evidence.includes(k[0])) match.evidence.push(k[0]);
    pairs.set(id,match);
  }
  const duplicates=[...pairs.values()].map(p=>({...p,status:p.sameName?'review_candidate':'review_name_conflict'}));
  return {total:people.length,proposals,duplicates,shared,writeAllowed:false};
}
