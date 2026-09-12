import policy from '../../config/realtime-capabilities.json' with { type: 'json' };

const ROLE_RANK = new Map(policy.roles.map((role, index) => [role, index]));

export function getRealtimePolicy() {
  return structuredClone(policy);
}

export function getSecurityProfile(profileName = policy.defaultSecurityProfile) {
  const profile = policy.securityProfiles[profileName];
  if (!profile) throw new Error(`unknown_security_profile:${profileName}`);
  return profile;
}

export function assertRoomPolicy(room) {
  if (!room || typeof room !== 'object') throw new Error('invalid_room');
  if (!policy.roomModes.includes(room.mode)) throw new Error(`invalid_room_mode:${room.mode}`);
  const profile = getSecurityProfile(room.securityProfile);
  if (room.aiEnabled && !profile.allowsAi) throw new Error('ai_not_allowed_for_security_profile');
  if (room.recordingEnabled && !profile.allowsRecording) throw new Error('recording_not_allowed_for_security_profile');
  if (room.recordingEnabled && profile.requiresRecordingNotice && !room.recordingNoticeEnabled) {
    throw new Error('recording_notice_required');
  }
  return true;
}

export function roleAtLeast(actualRole, requiredRole) {
  if (!ROLE_RANK.has(actualRole) || !ROLE_RANK.has(requiredRole)) return false;
  return ROLE_RANK.get(actualRole) <= ROLE_RANK.get(requiredRole);
}

export function canPerform(role, action) {
  const required = {
    view: 'viewer',
    speak: 'participant',
    present: 'presenter',
    manageParticipants: 'cohost',
    changeRoomPolicy: 'owner',
    startStopRecording: 'cohost',
    manageDestinations: 'owner'
  }[action];
  return required ? roleAtLeast(role, required) : false;
}

export function sanitizeClientRoom(room) {
  const {
    streamKeys,
    providerSecrets,
    providerApiKeys,
    turnSecret,
    ...safe
  } = room ?? {};
  return safe;
}
