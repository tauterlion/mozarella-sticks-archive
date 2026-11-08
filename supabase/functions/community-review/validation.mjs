const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text = (v, max, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const canonical = v => text(v,120) && /^[a-z0-9][a-z0-9-]*$/.test(v);
export function validMutation(body) {
 if (!uuid(body.id) || !uuid(body.requestId) || !Number.isSafeInteger(body.version) || body.version < 1) return false;
 if (body.action === 'reject') return text(body.reason,2000,0);
 if (body.action === 'approve') return true;
 if (!text(body.caption,500) || !Array.isArray(body.people) || body.people.length>100 || !body.people.every(canonical) ||
     new Set(body.people).size!==body.people.length || typeof body.noPeople!=='boolean' || body.noPeople!==(body.people.length===0)) return false;
 if (body.eventId!==null) return canonical(body.eventId) && body.proposedTitle===null && body.proposedDate===null && body.proposedDetails===null;
 if (!text(body.proposedTitle,160) || !text(body.proposedDetails,2000)) return false;
 if (body.proposedDate===null) return true;
 if (typeof body.proposedDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.proposedDate)) return false;
 const date=new Date(body.proposedDate);return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10)===body.proposedDate;
}
