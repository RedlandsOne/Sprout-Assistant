import os from "node:os";
import { execSync } from "node:child_process";

const WIN = process.platform === "win32";

function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf8", timeout: 10000, windowsHide: true }).trim(); }
  catch { return ""; }
}
function ps(script: string): string {
  return sh(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`);
}

function cpuPercent(): number {
  if (WIN) {
    const v = Number(ps(`(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average`));
    return isNaN(v) ? 0 : Math.round(v);
  }
  return Math.round((os.loadavg()[0] / os.cpus().length) * 100);
}
function memFreePercent(): number {
  if (!WIN) {
    const mp = sh(`memory_pressure | grep -i "percentage"`);
    const m = mp.match(/(\d+)%/);
    if (m) return Number(m[1]);
  }
  return Math.round((os.freemem() / os.totalmem()) * 100);
}
function diskLine(): string {
  if (WIN) {
    return ps(`$d=Get-PSDrive C; '{0}GB free of {1}GB' -f [math]::Round($d.Free/1GB),[math]::Round(($d.Used+$d.Free)/1GB)`) || "unknown";
  }
  const d = sh(`df -h / | tail -1`).split(/\s+/);
  return d.length >= 5 ? `${d[2]} used, ${d[3]} free (${d[4]} full)` : "unknown";
}
function batteryLine(): string {
  if (WIN) {
    const pct = ps(`(Get-CimInstance Win32_Battery).EstimatedChargeRemaining`);
    if (!pct) return "";
    const charging = ps(`(Get-CimInstance Win32_Battery).BatteryStatus`) === "2";
    return `${pct}%${charging ? " (charging)" : " (on battery)"}`;
  }
  const batt = sh(`pmset -g batt`);
  const m = batt.match(/(\d+)%/);
  if (!m) return "";
  return `${m[1]}%${/AC Power/.test(batt) ? " (charging)" : " (on battery)"}`;
}
function localIp(): string {
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) if (i.family === "IPv4" && !i.internal) return i.address;
  }
  return "unknown";
}
function wifiName(): string {
  if (WIN) {
    const out = sh(`netsh wlan show interfaces`);
    return out.match(/^\s*SSID\s*:\s*(.+)$/mi)?.[1]?.trim() ?? "";
  }
  const io = sh(`ioreg -l -w0 2>/dev/null | grep -m1 "IO80211SSID_STR" | sed -E 's/.*= "(.*)".*/\\1/'`);
  if (io && !/redacted/i.test(io)) return io.trim();
  for (const iface of ["en0", "en1"]) {
    const m = sh(`networksetup -getairportnetwork ${iface}`).match(/Current Wi-Fi Network:\s*(.+)$/);
    if (m && !/redacted/i.test(m[1])) return m[1].trim();
  }
  return "";
}

export function vitals(): string {
  const lines: string[] = [];
  const tips: string[] = [];
  const cpu = cpuPercent();
  lines.push(`🧮 CPU load: ${cpu}%`);
  if (cpu > 85) tips.push("CPU is slammed — something heavy is running.");
  const mem = memFreePercent();
  lines.push(`🧠 Memory free: ${mem}%`);
  if (mem < 15) tips.push("Memory's tight — closing some apps or tabs would help.");
  lines.push(`💾 Disk: ${diskLine()}`);
  const bat = batteryLine();
  if (bat) {
    lines.push(`🔋 Battery: ${bat}`);
    const bp = Number(bat.match(/(\d+)%/)?.[1] ?? 100);
    if (/on battery/.test(bat) && bp < 20) tips.push("Battery's low — plug in soon.");
  }
  const up = os.uptime();
  const days = Math.floor(up / 86400);
  const hours = Math.floor((up % 86400) / 3600);
  lines.push(`⏱️  Uptime: ${days}d ${hours}h  — last restarted ${new Date(Date.now() - up * 1000).toLocaleString()}`);
  if (days >= 7) tips.push(`You've been up ${days} days — a restart would do your computer good.`);
  let out = lines.join("\n");
  out += tips.length ? `\n\n💡 ${tips.join("\n💡 ")}` : `\n\n✅ Everything looks healthy.`;
  return out;
}

export function snapshot(): string {
  const up = os.uptime();
  const days = Math.floor(up / 86400);
  const hours = Math.floor((up % 86400) / 3600);
  return [
    `- CPU load: ~${cpuPercent()}%`,
    `- Memory free: ~${memFreePercent()}%`,
    `- Battery: ${batteryLine() || "no internal battery"}`,
    `- Disk: ${diskLine()}`,
    `- Uptime: ${days}d ${hours}h (last restarted ${new Date(Date.now() - up * 1000).toLocaleString()})`,
    `- Local IP: ${localIp()}`,
    `- System: ${os.platform()} ${os.release()} on host "${os.hostname()}"`,
    `- Current time: ${new Date().toLocaleString()}`,
  ].join("\n");
}

export function peripherals(): string {
  const parts: string[] = [];
  const name = wifiName();
  parts.push(name ? `Wi-Fi SSID: ${name}` : `Wi-Fi SSID: not available (do not guess a name).`);
  if (WIN) {
    const dev = ps(`Get-PnpDevice -PresentOnly -Status OK | Where-Object { $_.Class -in 'Monitor','Keyboard','Mouse','USB','AudioEndpoint','Bluetooth','DiskDrive','Image','Camera' } | Select-Object -ExpandProperty FriendlyName`);
    if (dev) parts.push(`=== Connected devices ===\n${dev.slice(0, 2500)}`);
    return parts.join("\n\n");
  }
  const usb = sh(`system_profiler SPUSBDataType 2>/dev/null`);
  if (usb) parts.push(`=== USB devices (raw) ===\n${usb.slice(0, 2200)}`);
  const bt = sh(`system_profiler SPBluetoothDataType 2>/dev/null`);
  if (bt) parts.push(`=== Bluetooth (raw) ===\n${bt.slice(0, 2200)}`);
  const disp = sh(`system_profiler SPDisplaysDataType 2>/dev/null`);
  if (disp) parts.push(`=== Displays (raw) ===\n${disp.slice(0, 1800)}`);
  return parts.join("\n\n");
}

export function senses(prompt: string): string {
  const p = prompt.toLowerCase();
  const bits: string[] = [];
  if (/\b(app|apps|open|running|window|using)\b/.test(p)) {
    const a = WIN
      ? ps(`Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object -ExpandProperty ProcessName -Unique`)
      : sh(`osascript -e 'tell application "System Events" to get name of (processes where background only is false)'`);
    if (a) bits.push(`Apps currently open:\n${WIN ? a : "- " + a.replace(/, /g, "\n- ")}`);
  }
  if (/\b(cpu|slow|hog|eating|heavy|lag|fan|busy)\b/.test(p)) {
    const t = WIN
      ? ps(`Get-Process | Sort-Object CPU -Descending | Select-Object -First 6 Name,CPU | Format-Table -HideTableHeaders | Out-String`)
      : sh(`ps -A -o %cpu,%mem,comm -r | head -n 6`);
    if (t) bits.push(`Top processes:\n${t}`);
  }
  if (/\b(clipboard|copied|paste|pasted)\b/.test(p)) {
    const clip = WIN ? ps(`Get-Clipboard`) : sh(`pbpaste`);
    bits.push(`Clipboard contents:\n${clip ? clip.slice(0, 500) : "(empty)"}`);
  }
  if (/\b(volume|sound|audio|loud|mute)\b/.test(p) && !WIN) {
    const v = sh(`osascript -e 'output volume of (get volume settings)'`);
    if (v) bits.push(`Output volume: ${v}%`);
  }
  return bits.join("\n\n");
}
