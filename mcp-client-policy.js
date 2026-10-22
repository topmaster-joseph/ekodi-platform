import { EKODI_CONNECT_CLIENT_CLASSES } from './ekodi-connect.js';

export const EKODI_MCP_CLIENT_POLICY=Object.freeze({
  version:'1.1.0',
  canonicalResource:'https://ekodi.kr/mcp',
  onboarding:Object.freeze({
    preRegisteredClientPreferred:true,
    dynamicRegistrationDefault:false,
    exactRedirectUriRequired:true,
    pkceS256Required:true,
    explicitUserConsentRequired:true,
    revocationRequired:true,
  }),
  authorization:Object.freeze({
    clientIdAloneIsAuthorization:false,
    activeConsentRequired:true,
    canonicalResourceGrantRequired:true,
    tokenValidationRequired:true,
    orchestratorIsExecutionAuthority:true,
  }),
  clientClasses:Object.freeze(EKODI_CONNECT_CLIENT_CLASSES.map(({id,provider,kind,status,toolProfile})=>Object.freeze({id,provider,kind,status,toolProfile}))),
});

export function publicEkodiMcpClientPolicy(){
  return Object.freeze({
    version:EKODI_MCP_CLIENT_POLICY.version,
    canonicalResource:EKODI_MCP_CLIENT_POLICY.canonicalResource,
    onboarding:EKODI_MCP_CLIENT_POLICY.onboarding,
    authorization:EKODI_MCP_CLIENT_POLICY.authorization,
    clientClasses:EKODI_MCP_CLIENT_POLICY.clientClasses,
  });
}
