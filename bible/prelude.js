if(typeof Array.prototype.replaceState!=='function')Object.defineProperty(Array.prototype,'replaceState',{value:(...args)=>window.history.replaceState(...args),configurable:true});
