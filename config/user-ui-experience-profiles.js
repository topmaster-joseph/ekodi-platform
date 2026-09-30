const freeze = value => Object.freeze(value);

export const EKODI_USER_EXPERIENCE_PROFILES = freeze({
  version: 1,
  policy: 'Experience profiles extend service-owned UI DNA; they never replace shared accessibility, chrome, or service identity.',
  profiles: freeze({
    'consumer-commerce': freeze({
      id: 'consumer-commerce',
      audience: 'general-consumer-shopping',
      purpose: 'Friendly shopping and discovery UI for consumer commerce surfaces.',
      geometry: freeze({
        controlRadius: '999px', fieldRadius: '999px', chipRadius: '999px',
        panelRadius: '28px', imageRadius: '24px', sectionRadius: '30px',
      }),
      rules: freeze([
        'pill-first actions and filters', 'soft search and form fields',
        '24-30px product and choice cards', 'rounded promotional sections',
        'mobile-friendly touch targets', 'shared footer exactly once',
      ]),
    }),
  }),
  serviceProfiles: freeze({ mall: 'consumer-commerce' }),
});

export function renderUserExperienceProfilesBootstrap() {
  const payload = JSON.stringify(EKODI_USER_EXPERIENCE_PROFILES).replace(/</g, '\\u003c');
  return `globalThis.__EKODI_USER_EXPERIENCE_PROFILES__=${payload};`;
}
