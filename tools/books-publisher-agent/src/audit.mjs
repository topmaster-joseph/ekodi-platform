import fs from 'node:fs';
import path from 'node:path';

export function createAudit(logPath) {
  const resolved = path.resolve(logPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return (event, detail = {}) => {
    const entry = {
      at: new Date().toISOString(),
      event,
      ...detail,
    };
    fs.appendFileSync(resolved, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  };
}
