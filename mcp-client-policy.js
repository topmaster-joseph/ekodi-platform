export const EKODI_MCP_CLIENT_POLICY=Object.freeze({
  version:'1.0.0',
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
  clientClasses:Object.freeze([
    Object.freeze({id:'chatgpt',provider:'openai',kind:'interactive-assistant',status:'supported'}),
    Object.freeze({id:'openai-responses-api',provider:'openai',kind:'api-runtime',status:'supported-with-registered-oauth-metadata'}),
    Object.freeze({id:'openai-agents-api',provider:'openai',kind:'agent-runtime',status:'supported-with-registered-oauth-metadata'}),
    Object.freeze({id:'openai-codex',provider:'openai',kind:'coding-agent',status:'supported-with-registered-oauth-metadata'}),
    Object.freeze({id:'generic-mcp-oauth',provider:'provider-neutral',kind:'mcp-client',status:'supported-with-registered-oauth-metadata'}),
  ]),
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
