import fs from 'node:fs';
const path = '.github/workflows/device-control-windows.yml';
let s = fs.readFileSync(path, 'utf8');

s = s.replaceAll("      - 'device-control-admin.css'\n      - 'admin-demand-loader.js'", "      - 'device-control-admin.css'\n      - 'remote-power-admin.js'\n      - 'remote-power-admin.css'\n      - 'admin-demand-loader.js'");
s = s.replaceAll("          test -f dist/device-control-admin.css\n          test -f dist/admin-demand-loader.js", "          test -f dist/device-control-admin.css\n          test -f dist/remote-power-admin.js\n          test -f dist/remote-power-admin.css\n          test -f dist/admin-demand-loader.js");
s = s.replace("          grep -Fq \"styles: ['device-control-admin.css']\" dist/admin-demand-loader.js", "          grep -Fq \"styles: ['device-control-admin.css', 'remote-power-admin.css']\" dist/admin-demand-loader.js");
s = s.replace("          grep -Fq \"scripts: ['device-control-admin.js']\" dist/admin-demand-loader.js", "          grep -Fq \"scripts: ['device-control-admin.js', 'remote-power-admin.js']\" dist/admin-demand-loader.js");
s = s.replace("            'maintenance.temp_cleanup','updates.scan','updates.install','profile.workstation.apply','profile.workstation.restore','agent.self_update'", "            'maintenance.temp_cleanup','updates.scan','updates.install','profile.workstation.apply','profile.workstation.restore','agent.self_update',\n            'remote_desktop.recovery.enable','remote_desktop.recovery.disable','remote_desktop.recovery.run'");

for (const marker of ["remote-power-admin.js", "styles: ['device-control-admin.css', 'remote-power-admin.css']", "remote_desktop.recovery.enable"]) {
  if (!s.includes(marker)) throw new Error(`CI marker missing: ${marker}`);
}
fs.writeFileSync(path, s);
console.log('Device Control CI aligned with Remote Work.');
