const NAME_HELPER='const __name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});';

export function serializeBrowserClient(fn){
  if(typeof fn!=='function')throw new TypeError('browser_client_function_required');
  return NAME_HELPER+'('+fn.toString()+')();';
}
