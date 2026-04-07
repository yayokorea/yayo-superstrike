import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { useCustomDevice } from '@/features/device/useCustomDevice';
import { useMcuManager } from '@/features/ota/useMcuManager';
import { compareSemver, downloadReleaseAsset, fetchLatestFirmwareRelease, getReleaseManifestUrl, type FirmwareReleaseManifest } from '@/features/ota/release';
import type { LogEntry } from '@/features/logs/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

import {
  MonitorPlay,
  Settings2,
  Activity,
  RefreshCw,
  Terminal,
  Battery,
  Cpu,
  Radio,
  Unplug,
  Power,
  Bluetooth,
  Upload,
  Download,
  PlayCircle,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';

type SectionId = 'device' | 'performance' | 'sensor' | 'firmware' | 'advanced';

const SECTIONS: Array<{ id: SectionId; label: string; description: string; icon: ReactNode }> = [
  { id: 'device', label: 'Device', description: '연결 상태와 기본 프로필', icon: <MonitorPlay className="w-4 h-4" /> },
  { id: 'performance', label: 'Performance', description: '기본 응답성과 절전 값', icon: <Settings2 className="w-4 h-4" /> },
  { id: 'sensor', label: 'Sensor', description: 'Hall 센서 상태와 캘리브레이션 준비', icon: <Activity className="w-4 h-4" /> },
  { id: 'firmware', label: 'Firmware', description: 'MCUmgr OTA와 슬롯 관리', icon: <RefreshCw className="w-4 h-4" /> },
  { id: 'advanced', label: 'Advanced', description: '개발자 로그와 디버그', icon: <Terminal className="w-4 h-4" /> },
];

function formatLogMessage(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.message;
  if (input instanceof Event) return `${input.type} event`;
  if (input && typeof input === 'object') {
    if ('message' in input && typeof (input as any).message === 'string') return (input as any).message;
    try { return JSON.stringify(input); } catch { return String(input); }
  }
  return String(input);
}

function formatNumber(value: number | null, digits = 2, unit = '') {
  if (value === null) return '--';
  return `${value.toFixed(digits)}${unit}`;
}

function SettingRow({ title, description, control }: { title: string; description: string; control: ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 py-4 px-1 group transition-colors">
      <div className="flex-1 min-w-0 pr-4">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 tracking-tight transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed tracking-wide">{description}</p>
      </div>
      <div className="shrink-0 w-full lg:w-auto max-w-full overflow-x-auto flex">{control}</div>
    </div>
  );
}

function Segment({ values, active }: { values: string[]; active: string }) {
  return (
    <Tabs value={active} className="w-full lg:w-max min-w-[280px]">
      <TabsList className="grid w-full h-auto" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
        {values.map((v) => (
          <TabsTrigger value={v} key={v} className="text-xs py-1.5 px-2">{v}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>('device');
  const [showLogs, setShowLogs] = useState(false);
  const [releaseInfo, setReleaseInfo] = useState<FirmwareReleaseManifest | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseStatus, setReleaseStatus] = useState('GitHub Release에서 최신 OTA 정보를 아직 확인하지 않았습니다.');
  const [releaseError, setReleaseError] = useState<string | null>(null);

  const appendLog = useCallback((scope: string, message: unknown, level: LogEntry['level'] = 'info') => {
    setLogs((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        level,
        scope,
        message: formatLogMessage(message),
        timestamp: new Date().toLocaleTimeString(),
      },
      ...current,
    ].slice(0, 80));
  }, []);

  const device = useCustomDevice(appendLog);
  const ota = useMcuManager(appendLog, device.bluetoothDevice, device.connected);

  const activeSlot = useMemo(() => ota.imageState.find((image) => image.active) ?? null, [ota.imageState]);
  const selectedSection = SECTIONS.find((section) => section.id === activeSection)!;
  const currentVersion = activeSlot?.version ?? null;
  const updateAvailable = releaseInfo !== null && (!currentVersion || compareSemver(releaseInfo.version, currentVersion) > 0);
  
  const otaStatusTone = ota.uploadState === 'completed' ? 'success' : ota.uploadState === 'error' ? 'danger' : ota.uploadState === 'uploading' ? 'warning' : ota.connected ? 'success' : 'warning';
  const otaStatusLabel = ota.uploadState === 'completed' ? 'Upload Complete' : ota.uploadState === 'error' ? 'Upload Error' : ota.uploadState === 'uploading' ? 'Uploading' : ota.connected ? 'Connected' : 'Disconnected';

  const loadLatestRelease = useCallback(async () => {
    setReleaseBusy(true);
    setReleaseError(null);
    setReleaseStatus('GitHub Release에서 최신 OTA manifest를 확인하는 중입니다.');

    try {
      const manifest = await fetchLatestFirmwareRelease();
      setReleaseInfo(manifest);

      const nextStatus = currentVersion
        ? compareSemver(manifest.version, currentVersion) > 0
          ? `새 펌웨어 ${manifest.version} 이(가) 있습니다.`
          : `현재 펌웨어 ${currentVersion} 가 최신입니다.`
        : `최신 펌웨어 ${manifest.version} 을(를) 찾았습니다.`;

      setReleaseStatus(nextStatus);
      appendLog('Release', `Loaded ${manifest.tag} from ${getReleaseManifestUrl()}`, 'success');
      return manifest;
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Failed to load latest release';
      setReleaseError(message);
      setReleaseStatus(message);
      appendLog('Release', message, 'error');
      return null;
    } finally {
      setReleaseBusy(false);
    }
  }, [appendLog, currentVersion]);

  const updateFromLatestRelease = useCallback(async () => {
    if (!ota.connected) {
      const message = 'OTA 연결 후에만 GitHub Release 업데이트를 시작할 수 있습니다.';
      setReleaseError(message);
      setReleaseStatus(message);
      appendLog('Release', message, 'warning');
      return;
    }

    setReleaseBusy(true);
    setReleaseError(null);
    setReleaseStatus('최신 릴리즈 정보를 확인하는 중입니다.');

    try {
      const manifest = releaseInfo ?? await fetchLatestFirmwareRelease();
      setReleaseInfo(manifest);

      if (currentVersion && compareSemver(manifest.version, currentVersion) <= 0) {
        const message = `현재 펌웨어 ${currentVersion} 가 이미 최신입니다.`;
        setReleaseStatus(message);
        appendLog('Release', message, 'info');
        return;
      }

      setReleaseStatus(`${manifest.asset.name} 다운로드 중입니다.`);
      const buffer = await downloadReleaseAsset(manifest);
      setReleaseStatus(`${manifest.asset.name} 업로드를 시작합니다.`);
      await ota.uploadPreparedImage(manifest.asset.name, buffer);
      setReleaseStatus(`GitHub Release ${manifest.version} 업로드가 완료되었습니다.`);
      appendLog('Release', `Uploaded ${manifest.asset.name} from GitHub Release`, 'success');
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Release OTA update failed';
      setReleaseError(message);
      setReleaseStatus(message);
      appendLog('Release', message, 'error');
    } finally {
      setReleaseBusy(false);
    }
  }, [appendLog, currentVersion, ota, releaseInfo]);

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-[#020817] font-sans selection:bg-blue-200 selection:text-blue-900 relative">
      {/* Subtle Ambient Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-100/40 via-transparent to-transparent dark:from-blue-900/20 dark:via-transparent dark:to-transparent pointer-events-none z-0" />
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 border-r border-slate-200/60 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl flex flex-col shadow-[4px_0_24px_-4px_rgba(0,0,0,0.02)] z-20">
        <div className="p-6 pb-2 flex items-center gap-3">
          <div className="flex w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white items-center justify-center font-bold text-xl shadow-lg ring-1 ring-blue-500/20">S</div>
          <div>
            <strong className="text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight">Superstrike</strong>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Device Driver</p>
          </div>
        </div>
        
        <div className="px-5 mt-6 mb-6">
          <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-800/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Radio className="w-3 h-3" /> Connected Device</span>
            <strong className="block mt-1.5 text-sm font-semibold truncate text-slate-800 dark:text-slate-200">{device.snapshot.name ?? ota.deviceName ?? 'No device selected'}</strong>
            <div className="flex flex-col gap-2 mt-3">
              <StatusBadge tone={device.connected ? 'success' : 'neutral'}>{device.connected ? 'Control Ready' : 'Control Idle'}</StatusBadge>
              <StatusBadge tone={ota.connected ? 'success' : 'neutral'}>{ota.connected ? 'OTA Ready' : 'OTA Idle'}</StatusBadge>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Sections">
          {SECTIONS.map((section) => {
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-all duration-300 relative group ${
                  isActive 
                    ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ring-1 ring-black/5 dark:ring-white/5' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 dark:bg-blue-500 rounded-r-full" />}
                <div className={`p-2.5 rounded-xl shrink-0 transition-colors duration-300 ${isActive ? 'bg-white dark:bg-blue-500/20 shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700'}`}>
                  {section.icon}
                </div>
                <div className="mt-0.5 flex-1 min-w-0">
                  <div className="font-semibold text-sm tracking-tight">{section.label}</div>
                  <div className={`text-[11px] leading-snug mt-0.5 tracking-wide truncate ${isActive ? 'text-blue-600/70 dark:text-blue-400/70' : 'text-slate-400 dark:text-slate-500'}`}>{section.description}</div>
                </div>
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800/60 mt-auto bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" className="w-full text-xs font-medium" onClick={() => setShowLogs(!showLogs)}>
            {showLogs ? 'Hide Developer Logs' : 'View Developer Logs'}
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#FAFBFF] dark:bg-slate-950/50 relative overflow-hidden pb-16 md:pb-0">
        {/* Topbar */}
        <header className="h-[72px] md:h-[88px] px-4 md:px-8 flex items-center justify-between bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/80 sticky top-0 z-10">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3 truncate">
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-xl bg-blue-100/50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0">
                {selectedSection.icon}
              </div>
              {selectedSection.label}
            </h1>
            <p className="hidden sm:block text-xs md:text-sm text-slate-500 font-medium mt-0.5 tracking-wide truncate">{selectedSection.description}</p>
          </div>
          <div className="flex gap-2 md:gap-4 shrink-0">
            <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 shrink-0">
                <Battery className="w-3 h-3 md:w-4 md:h-4" />
              </div>
              <div className="flex flex-col">
                <span className="hidden md:block text-[10px] font-bold tracking-widest text-slate-400 uppercase">Battery</span>
                <strong className="text-xs md:text-sm font-semibold">{device.snapshot.batteryPercent === null ? '--' : `${device.snapshot.batteryPercent}%`}</strong>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 shrink-0">
                <Cpu className="w-3 h-3 md:w-4 md:h-4" />
              </div>
              <div className="flex flex-col">
                <span className="hidden md:block text-[10px] font-bold tracking-widest text-slate-400 uppercase">Firmware</span>
                <strong className="text-xs md:text-sm font-semibold truncate max-w-[60px] md:max-w-none">{activeSlot?.version ?? '--'}</strong>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {activeSection === 'device' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="relative border-none shadow-sm bg-gradient-to-br from-white to-blue-50/30 overflow-hidden ring-1 ring-slate-200/50">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                  <CardHeader className="pb-4">
                    <CardDescription className="text-xs font-bold tracking-widest uppercase text-blue-500 mb-1">Connection State</CardDescription>
                    <CardTitle className="text-xl">기기 연결과 세션 상태</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                      메인 BLE 세션을 연결합니다. 연결되면 제어 notify와 OTA transport가 같은 디바이스 세션을 함께 사용합니다.
                    </p>
                    <div className="flex flex-wrap gap-3 mt-6 relative z-10">
                      <Button onClick={device.connect} disabled={device.connecting || device.connected} className="shadow-[0_4px_14px_rgba(37,99,235,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] h-11 px-6 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border border-blue-700 transition-all duration-300">
                        <Bluetooth className="w-4 h-4 mr-2" />
                        {device.connecting ? 'Connecting...' : 'Connect Device'}
                      </Button>
                      <Button variant="secondary" onClick={device.disconnect} disabled={!device.connected} className="h-11 px-6 rounded-xl border border-slate-200 shadow-sm">
                        <Unplug className="w-4 h-4 mr-2 text-slate-500" />
                        Disconnect
                      </Button>
                      <Button variant="outline" onClick={device.reboot} disabled={!device.connected} className="h-11 px-6 rounded-xl">
                        <Power className="w-4 h-4 mr-2 text-slate-500" />
                        Reboot
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="shadow-sm border-slate-200/60 max-h-min">
                    <CardHeader>
                      <CardDescription className="uppercase tracking-widest text-[10px] font-bold">Profile</CardDescription>
                      <CardTitle>기본 장치 정보</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                      {[{l: 'Device Name', v: device.snapshot.name ?? ota.deviceName ?? '--'},
                        {l: 'Battery Voltage', v: formatNumber(device.snapshot.batteryVoltage, 3, ' V')},
                        {l: 'Temperature', v: formatNumber(device.snapshot.temperatureC, 2, ' °C')},
                        {l: 'Active Slot', v: activeSlot ? `Slot ${activeSlot.slot}` : '--'}
                      ].map((info) => (
                        <div key={info.l} className="bg-slate-50/50 dark:bg-slate-900 border rounded-2xl p-4 flex flex-col justify-center min-w-0">
                          <span className="text-[11px] font-bold text-slate-400 tracking-wide uppercase">{info.l}</span>
                          <strong className="text-base mt-1 text-slate-800 dark:text-slate-100 truncate">{info.v}</strong>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  
                  <Card className="shadow-sm border-slate-200/60 bg-gradient-to-b from-white to-slate-50/20">
                    <CardHeader>
                      <CardDescription className="uppercase tracking-widest text-[10px] font-bold">Preview</CardDescription>
                      <CardTitle>장치 상태 프리뷰</CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center items-center py-6">
                      <div className="w-full max-w-[280px] h-[220px] relative flex flex-col items-center justify-center p-6 border border-slate-200/50 dark:border-slate-800 rounded-3xl bg-slate-50/30 dark:bg-slate-900/30 shadow-[inset_0_2px_20px_rgba(0,0,0,0.02)] overflow-hidden">
                          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent opacity-50" />
                          <div className="w-24 h-32 rounded-[24px] bg-gradient-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 shadow-[0_15px_35px_-10px_rgba(0,0,0,0.15),inset_0_2px_10px_rgba(255,255,255,0.9),inset_0_-2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_15px_35px_-10px_rgba(0,0,0,0.4),inset_0_2px_10px_rgba(255,255,255,0.05),inset_0_-2px_10px_rgba(0,0,0,0.2)] ring-1 ring-slate-200/50 dark:ring-white/10 flex flex-col justify-between items-center py-4 relative z-10 transition-transform duration-700 hover:scale-105 hover:-rotate-1">
                            {/* Scroll wheel mock */}
                            <div className="w-2 h-6 rounded-full bg-gradient-to-b from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"></div>
                            {/* Logo mock */}
                            <div className="w-4 h-4 rounded-full bg-blue-500/10 dark:bg-blue-400/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500/40 dark:bg-blue-400/50"></div>
                            </div>
                          </div>

                          <div className="absolute bottom-5 left-5 bg-white/80 dark:bg-slate-800/80 backdrop-blur shadow-sm border border-white/50 dark:border-slate-700 rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 z-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                            H1 <span className="text-slate-900 dark:text-slate-200">{device.snapshot.hall1 ?? '--'}</span>
                          </div>
                          <div className="absolute bottom-5 right-5 bg-white/80 dark:bg-slate-800/80 backdrop-blur shadow-sm border border-white/50 dark:border-slate-700 rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 z-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                            H2 <span className="text-slate-900 dark:text-slate-200">{device.snapshot.hall2 ?? '--'}</span>
                          </div>
                      </div>                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeSection === 'performance' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="shadow-sm border-slate-200/60">
                  <CardHeader>
                    <CardTitle>입력 반응성 설정</CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    <SettingRow title="Button Debounce" description="반응성 조정 후보입니다." control={<Segment values={['0ms', '1ms', '2ms', '4ms', '8ms']} active="4ms" />} />
                    <SettingRow title="Sleep Timeout" description="절전 진입 시간 설정입니다." control={<Segment values={['30s', '1m', '2m', '5m', '10m']} active="1m" />} />
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200/60">
                  <CardHeader>
                    <CardTitle>성능 프로필 프리뷰</CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    <SettingRow title="Polling Feel" description="Polling Rate 연계 튜닝" control={<Segment values={['Eco', 'Balanced', 'Fast']} active="Balanced" />} />
                    <div className="mt-6 p-6 border rounded-xl bg-slate-50">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-semibold">Input Latency Profile</span>
                        <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-md">Medium</span>
                      </div>
                      <Slider defaultValue={[50]} max={100} step={50} className="w-full" />
                      <div className="flex justify-between mt-3 text-xs text-slate-400 font-medium px-1">
                        <span>Low</span><span>Medium</span><span>High</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'sensor' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-6">
                  <Card className="shadow-sm border-slate-200/60">
                    <CardHeader>
                      <CardDescription className="uppercase tracking-widest text-[10px] font-bold">Live Data</CardDescription>
                      <CardTitle>Hall 센서 리드오프</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        {[{l: 'Hall Left', v: device.snapshot.hall1 ?? '--'}, {l: 'Hall Right', v: device.snapshot.hall2 ?? '--'}, {l: 'Temperature', v: formatNumber(device.snapshot.temperatureC, 2, ' °C')}, {l: 'Battery', v: device.snapshot.batteryPercent === null ? '--' : `${device.snapshot.batteryPercent}%`}].map((item) => (
                          <div key={item.l} className="bg-slate-50 dark:bg-slate-900 border rounded-xl p-4">
                            <div className="text-[11px] font-bold text-slate-400 uppercase">{item.l}</div>
                            <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">{item.v}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="shadow-sm border-slate-200/60">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div>
                        <CardDescription className="uppercase tracking-widest text-[10px] font-bold">State</CardDescription>
                        <CardTitle>현재 캘리브레이션 상태</CardTitle>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void device.refreshCalibrationStatus()} disabled={!device.connected}>
                        <RefreshCw className="w-3 h-3 mr-2" /> Refresh
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {device.snapshot.calStatus ? (
                        <div className="bg-slate-950 rounded-xl p-4 font-mono text-[11px] text-slate-300 leading-relaxed shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] overflow-x-auto">
                           <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
                             <StatusBadge tone={device.snapshot.calStatus.hall1Ready ? 'success' : 'danger'}>H1 {device.snapshot.calStatus.hall1Ready ? 'Ready' : 'Not Ready'}</StatusBadge>
                             <StatusBadge tone={device.snapshot.calStatus.hall2Ready ? 'success' : 'danger'}>H2 {device.snapshot.calStatus.hall2Ready ? 'Ready' : 'Not Ready'}</StatusBadge>
                           </div>
                           <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                             <div className="text-slate-500">H1 Idle: <span className="text-slate-200">{device.snapshot.calStatus.hall1Idle}</span></div>
                             <div className="text-slate-500">H2 Idle: <span className="text-slate-200">{device.snapshot.calStatus.hall2Idle}</span></div>
                             <div className="text-slate-500">H1 Press: <span className="text-slate-200">{device.snapshot.calStatus.hall1Press}</span></div>
                             <div className="text-slate-500">H2 Press: <span className="text-slate-200">{device.snapshot.calStatus.hall2Press}</span></div>
                             <div className="text-slate-500">H1 Thres: <span className="text-blue-300">{device.snapshot.calStatus.hall1Threshold}</span></div>
                             <div className="text-slate-500">H2 Thres: <span className="text-blue-300">{device.snapshot.calStatus.hall2Threshold}</span></div>
                             <div className="text-slate-500">H1 Rel: <span className="text-emerald-300">{device.snapshot.calStatus.hall1Release}</span></div>
                             <div className="text-slate-500">H2 Rel: <span className="text-emerald-300">{device.snapshot.calStatus.hall2Release}</span></div>
                           </div>
                           <div className="mt-3 pt-2 border-t border-slate-800 text-slate-500 flex justify-between">
                              <span>Active Cmd: {device.snapshot.calStatus.activeCommand}</span>
                              <span>Samples: {device.snapshot.calStatus.sampleCount}/8</span>
                           </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-900 border border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center">
                          <Activity className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-3" />
                          <p className="text-sm text-slate-500 font-medium">기기를 연결하여 캘리브레이션 정보를 동기화하세요.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="shadow-sm border-slate-200/60 max-h-min">
                  <CardHeader>
                    <CardDescription className="uppercase tracking-widest text-[10px] font-bold">Calibration</CardDescription>
                    <CardTitle>센서 캘리브레이션 설정</CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    <SettingRow title="H1 (Left) Idle 보정" description="스위치를 누르지 않은 상태에서 기록합니다." control={<Button onClick={() => void device.sendCalibrationCommand(device.CAL_COMMANDS.hall1Idle)} disabled={!device.connected} variant="outline" size="sm" className="w-24">기록</Button>} />
                    <SettingRow title="H1 (Left) Press 보정" description="스위치를 끝까지 누른 상태에서 기록합니다." control={<Button onClick={() => void device.sendCalibrationCommand(device.CAL_COMMANDS.hall1Press)} disabled={!device.connected} variant="secondary" size="sm" className="w-24 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100">기록</Button>} />
                    <SettingRow title="H2 (Right) Idle 보정" description="스위치를 누르지 않은 상태에서 기록합니다." control={<Button onClick={() => void device.sendCalibrationCommand(device.CAL_COMMANDS.hall2Idle)} disabled={!device.connected} variant="outline" size="sm" className="w-24">기록</Button>} />
                    <SettingRow title="H2 (Right) Press 보정" description="스위치를 끝까지 누른 상태에서 기록합니다." control={<Button onClick={() => void device.sendCalibrationCommand(device.CAL_COMMANDS.hall2Press)} disabled={!device.connected} variant="secondary" size="sm" className="w-24 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100">기록</Button>} />
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'firmware' && (
              <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="shadow-sm border-slate-200/60">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardDescription className="uppercase tracking-widest text-[10px] font-bold">OTA Session</CardDescription>
                      <CardTitle>펌웨어 업데이트</CardTitle>
                    </div>
                    <StatusBadge tone={otaStatusTone}>{otaStatusLabel}</StatusBadge>
                  </CardHeader>
                  <CardContent className="space-y-6 mt-4">
                      <SettingRow 
                        title="MCUmgr 연결" 
                        description="메인 BLE 세션에 자동으로 붙습니다. 별도 기기 선택은 필요하지 않습니다." 
                        control={
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => void ota.refreshImageState()} disabled={!ota.connected || ota.busy}>
                            Read
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => void ota.disconnect()} disabled={!ota.connected}>
                            Disconnect
                          </Button>
                        </div>
                      }
                    />

                    <div className="bg-slate-50/50 dark:bg-slate-900 border rounded-2xl p-6 shadow-inherit">
                      <div className="mb-6 rounded-2xl border bg-white dark:bg-slate-950 p-4 space-y-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">GitHub Release OTA</h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-all">Manifest: {getReleaseManifestUrl()}</p>
                          </div>
                          <Badge variant="secondary" className="font-mono w-fit">{releaseInfo?.tag ?? 'No release loaded'}</Badge>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border bg-slate-50 dark:bg-slate-900 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Current</div>
                            <div className="mt-1 font-mono text-sm text-slate-800 dark:text-slate-100">{currentVersion ?? '--'}</div>
                          </div>
                          <div className="rounded-xl border bg-slate-50 dark:bg-slate-900 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Latest</div>
                            <div className="mt-1 font-mono text-sm text-slate-800 dark:text-slate-100">{releaseInfo?.version ?? '--'}</div>
                          </div>
                        </div>

                        <div className={`rounded-xl border px-4 py-3 text-sm ${releaseError ? 'border-red-200 bg-red-50 text-red-800' : updateAvailable ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                          {releaseStatus}
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button variant="outline" onClick={() => void loadLatestRelease()} disabled={releaseBusy || ota.busy}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${releaseBusy ? 'animate-spin' : ''}`} /> Check latest
                          </Button>
                          <Button onClick={() => void updateFromLatestRelease()} disabled={!ota.connected || releaseBusy || ota.busy} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                            <Download className="w-4 h-4 mr-2" /> Download & Upload Latest
                          </Button>
                        </div>
                      </div>

                      <label className="block text-sm font-semibold mb-3 text-slate-800 dark:text-slate-200" htmlFor="firmware-file">펌웨어 이미지 업로드</label>
                      <div className="relative">
                        <input
                          id="firmware-file"
                          type="file"
                          accept=".bin,.img"
                          onChange={(event) => void ota.selectFile(event.target.files?.[0] ?? null)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="flex items-center justify-center w-full min-h-[140px] border-2 border-dashed border-blue-200/60 dark:border-blue-800/40 rounded-2xl bg-blue-50/30 dark:bg-blue-950/20 text-slate-500 transition-all duration-300 hover:bg-blue-50/80 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700/50 group">
                          <div className="flex flex-col items-center gap-3 pointer-events-none">
                            <div className="w-12 h-12 rounded-full bg-blue-100/50 dark:bg-blue-900/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                              <Upload className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                            </div>
                            <span className="text-sm font-medium tracking-wide">클릭하거나 파일을 여기로 드래그 하세요 (.bin, .img)</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex justify-between items-center p-3 rounded-lg bg-white dark:bg-slate-950 border">
                        <span className="text-sm text-slate-600 font-medium truncate shrink">{ota.file?.name ?? 'No file selected'}</span>
                        <Badge variant="secondary" className="font-mono">{ota.imageInfo?.version ?? 'Unknown Ver'}</Badge>
                      </div>

                      <div className={`mt-4 p-4 rounded-xl border flex items-center justify-between ${ota.uploadState === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : ota.uploadState === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                           {ota.uploadState === 'completed' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : ota.uploadState === 'error' ? <AlertCircle className="w-5 h-5 text-red-500" /> : ota.uploadState === 'uploading' ? <RefreshCw className="w-5 h-5 animate-spin text-blue-500" /> : <Info className="w-5 h-5 text-slate-400" />}
                           <strong className="text-sm">{ota.statusMessage}</strong>
                        </div>
                      </div>

                      <div className="mt-5 space-y-2">
                         <div className="flex justify-between text-xs font-semibold text-slate-500">
                           <span>Progress</span>
                           <span>{ota.progress}%</span>
                         </div>
                         <Progress value={ota.progress} className="h-2 w-full bg-slate-200" />
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <Button onClick={() => void ota.upload()} disabled={!ota.connected || ota.busy || !ota.imageInfo} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                          <Upload className="w-4 h-4 mr-2" /> Upload
                        </Button>
                        <Button variant="outline" onClick={() => void ota.test()} disabled={!ota.connected || ota.busy || !ota.testTargetImage} className="rounded-xl">
                          <PlayCircle className="w-4 h-4 mr-2" /> Test
                        </Button>
                        <Button variant="outline" onClick={() => void ota.confirm()} disabled={!ota.connected || ota.busy || ota.imageState.length === 0} className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                          <CheckCircle className="w-4 h-4 mr-2" /> Confirm
                        </Button>
                        <Button variant="ghost" onClick={() => void ota.reset()} disabled={!ota.connected || ota.busy} className="ml-auto rounded-xl">
                          <RefreshCw className="w-4 h-4 mr-2" /> Reset
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200/60">
                  <CardHeader>
                    <CardTitle>이미지 슬롯 상태</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {ota.imageState.length === 0 ? (
                        <p className="text-sm text-slate-500 py-4 col-span-2 text-center">아직 읽은 슬롯 상태가 없습니다.</p>
                      ) : (
                        ota.imageState.map((image) => (
                          <div key={`${image.slot}-${image.version ?? 'unknown'}`} className="p-4 border rounded-xl flex justify-between items-center bg-slate-50 shrink-0">
                            <div>
                               <div className="text-[10px] font-bold uppercase text-slate-400">Slot {image.slot}</div>
                               <div className="font-mono text-sm font-semibold mt-1">{image.version ?? 'Unknown version'}</div>
                            </div>
                            <div className="flex flex-col gap-1.5 items-end">
                               <StatusBadge tone={image.active ? 'success' : 'neutral'}>{image.active ? 'Active' : 'Inactive'}</StatusBadge>
                               <StatusBadge tone={image.pending ? 'warning' : 'neutral'}>{image.pending ? 'Pending' : 'Not Pending'}</StatusBadge>
                               <StatusBadge tone={image.confirmed ? 'success' : 'neutral'}>{image.confirmed ? 'Confirmed' : 'Unconfirmed'}</StatusBadge>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'advanced' && (
              <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="shadow-sm border-slate-200/60">
                  <CardHeader className="flex flex-row justify-between items-center pb-2">
                    <div>
                      <CardTitle>제어 및 OTA 상태 이력</CardTitle>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowLogs(!showLogs)}>
                      {showLogs ? 'Hide Logs' : 'View Logs'}
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <SettingRow title="Control Transport Error" description="커스텀 BLE 연결 에러" control={<span className="text-sm font-mono text-rose-500 bg-rose-50 px-3 py-1 rounded-md">{device.error ?? 'None'}</span>} />
                    <SettingRow title="OTA Error" description="MCUmgr 에러" control={<span className="text-sm font-mono text-rose-500 bg-rose-50 px-3 py-1 rounded-md">{ota.error ?? 'None'}</span>} />
                  </CardContent>
                </Card>
              </div>
            )}

          </div>
        </div>

        
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-6 left-4 right-4 h-16 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.1)] rounded-3xl z-50 flex items-center justify-around px-2">
        {SECTIONS.map((section) => {
          const isActive = section.id === activeSection;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all duration-300 relative ${
                isActive ? 'text-blue-600 dark:text-blue-400 scale-105' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {isActive && <div className="absolute top-1 w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400" />}
              <div className={`p-1.5 rounded-xl transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-500/20' : ''}`}>
                 <span className={isActive ? 'opacity-100' : 'opacity-70'}>{section.icon}</span>
              </div>
              <span className={`text-[9px] tracking-wide leading-none transition-all duration-300 ${isActive ? 'font-bold opacity-100' : 'font-medium opacity-70'}`}>{section.label}</span>
            </button>
          )
        })}
      </nav>

        {/* Logs Drawer overlay using absolute positioning at bottom, or inside layout */}
        {showLogs && (
          <div className="absolute inset-x-0 bottom-[64px] md:bottom-0 bg-white/95 backdrop-blur-xl border-t shadow-[0_-10px_40px_rgba(0,0,0,0.05)] h-64 flex flex-col z-30 animate-in slide-in-from-bottom-8">
            <div className="flex items-center justify-between px-6 py-3 border-b bg-slate-50/80">
              <div className="flex items-center gap-3">
                <Terminal className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-sm">Developer Logs</h3>
                <Badge variant="secondary" className="px-1.5 py-0 min-w-0 text-[10px]">{logs.length} entries</Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full" onClick={() => setShowLogs(false)}>
                &times;
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 py-2 bg-slate-950 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-slate-500 flex h-full items-center justify-center">아직 기록된 로그가 없습니다.</div>
              ) : (
                <div className="space-y-1">
                  {logs.map((entry) => (
                    <div key={entry.id} className="flex gap-4 py-1.5 border-b border-white/5 hover:bg-white/5 px-2 rounded group">
                      <div className="text-slate-500 shrink-0 w-20">{entry.timestamp}</div>
                      <div className={`shrink-0 w-16 uppercase tracking-wider text-[10px] flex items-center ${entry.level === 'error' ? 'text-rose-400' : entry.level === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>
                        {entry.level}
                      </div>
                      <div className="text-slate-400 shrink-0 min-w-0 md:w-32 truncate">{entry.scope}</div>
                      <div className={`break-words text-slate-300 flex-1 ${entry.level === 'error' ? 'text-rose-200' : ''}`}>{entry.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
 
