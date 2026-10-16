// Read-only, fail-closed verification of an existing, exactly approved Git ref.
// Some restricted GitHub integrations cannot read git/ref even when the ordinary
// branch endpoint exposes the owner-issued branch. Neither API grants approval.
export function assessExactRecoveryBranch({gitRef,branch,expectedSha}){
  if(!/^[0-9a-f]{40}$/i.test(String(expectedSha||'')))throw new Error('invalid approved recovery SHA');
  const refStatus=Number(gitRef?.status||0);
  if(gitRef?.ok){
    if(gitRef?.sha!==expectedSha)throw new Error('existing recovery branch does not match the exact approved source SHA');
    return true;
  }
  if(![403,404].includes(refStatus))throw new Error('failed to inspect existing recovery branch: HTTP '+refStatus);
  if(branch?.ok){
    if(branch?.sha!==expectedSha)throw new Error('existing recovery branch does not match the exact approved source SHA');
    return true;
  }
  if(branch?.status===404)return false;
  throw new Error('failed to inspect recovery branch through independent branch endpoint: HTTP '+String(branch?.status||0));
}
