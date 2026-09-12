const TERMINAL = new Set(['ended', 'failed']);

export class RealtimeRoomState {
  constructor({ roomId, tenantId, hostUserId, mode, securityProfile }) {
    this.roomId = roomId;
    this.tenantId = tenantId;
    this.hostUserId = hostUserId;
    this.mode = mode;
    this.securityProfile = securityProfile;
    this.status = 'created';
    this.degraded = new Set();
    this.activeLanguages = new Set();
    this.destinations = new Map();
    this.recording = 'idle';
  }

  transition(next) {
    const allowed = {
      created: new Set(['starting', 'ended', 'failed']),
      starting: new Set(['live', 'failed', 'ended']),
      live: new Set(['ending', 'failed']),
      ending: new Set(['ended', 'failed']),
      ended: new Set(),
      failed: new Set()
    };
    if (!allowed[this.status]?.has(next)) {
      throw new Error(`invalid_room_transition:${this.status}->${next}`);
    }
    this.status = next;
  }

  markDegraded(component, degraded = true) {
    if (degraded) this.degraded.add(component);
    else this.degraded.delete(component);
  }

  activateLanguage(language) {
    if (TERMINAL.has(this.status)) throw new Error('room_not_active');
    if (!language || typeof language !== 'string') throw new Error('invalid_language');
    this.activeLanguages.add(language.trim().toLowerCase());
  }

  deactivateLanguage(language) {
    this.activeLanguages.delete(String(language || '').trim().toLowerCase());
  }

  setRecording(status) {
    const allowed = {
      idle: new Set(['starting']),
      starting: new Set(['recording', 'failed', 'idle']),
      recording: new Set(['stopping', 'failed']),
      stopping: new Set(['idle', 'failed']),
      failed: new Set(['starting', 'idle'])
    };
    if (!allowed[this.recording]?.has(status)) {
      throw new Error(`invalid_recording_transition:${this.recording}->${status}`);
    }
    this.recording = status;
  }

  setDestination(id, status, detail = null) {
    if (!id) throw new Error('destination_id_required');
    this.destinations.set(id, { status, detail, updatedAt: new Date().toISOString() });
  }

  snapshot() {
    return {
      roomId: this.roomId,
      tenantId: this.tenantId,
      hostUserId: this.hostUserId,
      mode: this.mode,
      securityProfile: this.securityProfile,
      status: this.status,
      degraded: [...this.degraded].sort(),
      activeLanguages: [...this.activeLanguages].sort(),
      destinations: Object.fromEntries(this.destinations),
      recording: this.recording
    };
  }
}
