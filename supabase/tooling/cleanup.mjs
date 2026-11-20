import { pathToFileURL } from 'node:url';
import { removePrivateObject } from './private-object-cleanup.mjs';

export function retentionAlerts(report) {
  const alerts=[];
  if (report.budgetBytes>0 && report.reservedBytes/report.budgetBytes>=0.8) alerts.push('capacity_at_or_above_80_percent');
  if (report.stalledCleanup>0 || report.oldestUnconfirmedSeconds>1800) alerts.push('cleanup_needs_attention');
  return alerts;
}

export async function runRetention({ rpc, remove, apply = false }) {
  if (!apply) {
    const report=await rpc('report');
    return {mode:'report',...report,alerts:retentionAlerts(report)};
  }
  const claim = await rpc('claim');
  const summary = { mode:'apply', claimed:claim.items.length, released:0, failed:0, unconfirmed:0,
    expiredBatches:claim.expiredBatches, expiredRateWindows:claim.expiredRateWindows };
  for (const item of claim.items) {
    try {
      if (item.path !== `incoming/${item.batchId}/${item.id}`) throw Error('Invalid claim path');
      await remove(item.path);
      if ((await rpc('complete',{id:item.id,lease:claim.lease})).released) summary.released++;
      else summary.unconfirmed++;
    } catch {
      // Continue independent items. The affected reservation stays owned by
      // this lease until automatic retry. No paths or credentials in output.
      summary.failed++;
    }
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length>1 || args.length===1&&!['--report','--apply'].includes(args[0])) throw Error('Expected --report or --apply');
  const apply=args[0]==='--apply', target=process.env.AOMS_CLEANUP_TARGET;
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hostedRef='kvyrbtooynofijdtmqup';
  const validTarget=target==='aoms-local' && ['http://localhost:54321','http://127.0.0.1:54321'].includes(url)
    || target===hostedRef && url===`https://${hostedRef}.supabase.co`;
  if (!validTarget || !key) throw Error('Cleanup target or credentials are not configured');
  if (apply && (target!==hostedRef || process.env.AOMS_CLEANUP_APPLY_PROJECT!==hostedRef)) {
    throw Error('Deletion requires a separate reviewed approval and an exact hosted project opt-in');
  }
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  const summary=await runRetention({apply,
    async rpc(action,payload={}) {
      const r=await fetch(`${url}/rest/v1/rpc/submission_retention`,{
        method:'POST',headers,body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(15000)
      });
      if (!r.ok) throw Error('Retention database request failed');
      const result=await r.json();
      if (!result || result.error) throw Error('Retention action was not accepted');
      return result;
    },
    remove:path=>removePrivateObject(url,headers,path)
  });
  console.log(JSON.stringify({at:new Date().toISOString(),target,...summary}));
  if (summary.failed || summary.unconfirmed) process.exitCode=1;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
