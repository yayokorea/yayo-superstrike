import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { useCustomDevice } from '@/features/device/useCustomDevice';
import { useMcuManager } from '@/features/ota/useMcuManager';
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
    <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 p-4 rounded-xl border bg-card/50 hover:bg-card/80 transition-colors shadow-sm overflow-hidden">
      <div className="flex-1 min-w-0 pr-4">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="shrink-0 w-full lg:w-auto max-w-full overflow-x-auto flex pb-1 -mb-1">{control}</div>
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
  const ota = useMcuManager(appendLog);

  const activeSlot = useMemo(() => ota.imageState.find((image) => image.active) ?? null, [ota.imageState]);
  const selectedSection = SECTIONS.find((section) => section.id === activeSection)!;
  
  const otaStatusTone = ota.uploadState === 'completed' ? 'success' : ota.uploadState === 'error' ? 'danger' : ota.uploadState === 'uploading' ? 'warning' : ota.connected ? 'success' : 'warning';
  const otaStatusLabel = ota.uploadState === 'completed' ? 'Upload Complete' : ota.uploadState === 'error' ? 'Upload Error' : ota.uploadState === 'uploading' ? 'Uploading' : ota.connected ? 'Connected' : 'Disconnected';

  return (
    <div className="flex h-screen w-full bg-slate-50/50 dark:bg-slate-950 font-sans selection:bg-blue-200 selection:text-blue-900">
      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-200/60 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl flex flex-col shadow-[4px_0_24px_-4px_rgba(0,0,0,0.02)] z-20">
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
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200 ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 shadow-sm' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  {section.icon}
                </div>
                <div className="mt-0.5">
                  <div className="font-semibold text-sm">{section.label}</div>
                  <div className={`text-[11px] leading-snug mt-0.5 ${isActive ? 'text-blue-500/80 dark:text-blue-400/80' : 'text-slate-400'}`}>{section.description}</div>
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
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#FAFBFF] dark:bg-slate-950/50 relative overflow-hidden">
        {/* Topbar */}
        <header className="h-[88px] px-8 flex items-center justify-between bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/80 sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {selectedSection.label}
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5 tracking-wide">{selectedSection.description}</p>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                <Battery className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Battery</span>
                <strong className="text-sm font-semibold">{device.snapshot.batteryPercent === null ? '--' : `${device.snapshot.batteryPercent}%`}</strong>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Firmware</span>
                <strong className="text-sm font-semibold">{activeSlot?.version ?? '--'}</strong>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {activeSection === 'device' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="border-none shadow-sm bg-gradient-to-br from-white to-blue-50/30 overflow-hidden ring-1 ring-slate-200/50">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                  <CardHeader className="pb-4">
                    <CardDescription className="text-xs font-bold tracking-widest uppercase text-blue-500 mb-1">Connection State</CardDescription>
                    <CardTitle className="text-xl">기기 연결과 세션 상태</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                      현재 세션 제어를 담당합니다. 연결 및 연결 해제를 관리하며 빠른 설정 전환을 위한 제어를 수행합니다.
                    </p>
                    <div className="flex flex-wrap gap-3 mt-6 relative z-10">
                      <Button onClick={device.connect} disabled={device.connecting || device.connected} className="shadow-md h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                        <Bluetooth className="w-4 h-4 mr-2" />
                        {device.connecting ? 'Connecting...' : 'Connect Control'}
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
                        <div key={info.l} className="bg-slate-50/50 dark:bg-slate-900 border rounded-2xl p-4 flex flex-col justify-center">
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
                      <div className="w-full max-w-[280px] h-[220px] relative flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                          <div className="w-24 h-32 rounded-3xl bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] ring-1 ring-slate-200/50 flex flex-col justify-between items-center py-4 relative">
                            {/* Scroll wheel mock */}
                            <div className="w-2 h-6 rounded-full bg-slate-200/60 border border-slate-300"></div>
                            {/* Logo mock */}
                            <div className="w-4 h-4 rounded-full bg-blue-100 opacity-50"></div>
                          </div>
                          
                          <div className="absolute bottom-6 left-6 bg-white shadow-sm border rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                            H1 <span className="text-slate-900">{device.snapshot.hall1 ?? '--'}</span>
                          </div>
                          <div className="absolute bottom-6 right-6 bg-white shadow-sm border rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                            H2 <span className="text-slate-900">{device.snapshot.hall2 ?? '--'}</span>
                          </div>
                      </div>
                    </CardContent>
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
                  <CardContent className="space-y-4">
                    <SettingRow title="Button Debounce" description="반응성 조정 후보입니다." control={<Segment values={['0ms', '1ms', '2ms', '4ms', '8ms']} active="4ms" />} />
                    <SettingRow title="Sleep Timeout" description="절전 진입 시간 설정입니다." control={<Segment values={['30s', '1m', '2m', '5m', '10m']} active="1m" />} />
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200/60">
                  <CardHeader>
                    <CardTitle>성능 프로필 프리뷰</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                <Card className="shadow-sm border-slate-200/60">
                  <CardHeader>
                    <CardDescription className="uppercase tracking-widest text-[10px] font-bold">Live Data</CardDescription>
                    <CardTitle>Hall 센서 리드오프</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {[{l: 'Hall Left', v: device.snapshot.hall1 ?? '--'}, {l: 'Hall Right', v: device.snapshot.hall2 ?? '--'}, {l: 'Temperature', v: formatNumber(device.snapshot.temperatureC, 2, ' °C')}, {l: 'Battery', v: device.snapshot.batteryPercent === null ? '--' : `${device.snapshot.batteryPercent}%`}].map((item) => (
                        <div key={item.l} className="bg-slate-50 border rounded-xl p-4">
                          <div className="text-[11px] font-bold text-slate-400 uppercase">{item.l}</div>
                          <div className="text-lg font-bold text-slate-800 mt-1">{item.v}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200/60">
                  <CardHeader>
                    <CardDescription className="uppercase tracking-widest text-[10px] font-bold">Calibration</CardDescription>
                    <CardTitle>센서 캘리브레이션</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <SettingRow title="Trigger Threshold" description="최적화된 아날로그 입력 임계값 설정" control={<div className="w-[180px]"><Slider defaultValue={[50]} max={100} step={50} /><div className="flex justify-between mt-2 text-[10px] text-slate-500 font-medium"><span>Low</span><span>Normal</span><span>High</span></div></div>} />
                    <SettingRow title="Calibration Workflow" description="Idle/Press 보정 액션" control={<Button variant="outline" size="sm">Coming Soon</Button>} />
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
                      description="SMP over BLE 연결을 관리합니다." 
                      control={
                        <div className="flex gap-2">
                          <Button onClick={ota.connect} disabled={ota.connecting || ota.connected} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                            <Bluetooth className="w-4 h-4 mr-2" /> {ota.connecting ? 'Connecting...' : 'Connect'}
                          </Button>
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
                      <label className="block text-sm font-semibold mb-3 text-slate-800 dark:text-slate-200" htmlFor="firmware-file">펌웨어 이미지 업로드</label>
                      <div className="relative">
                        <input
                          id="firmware-file"
                          type="file"
                          accept=".bin,.img"
                          onChange={(event) => void ota.selectFile(event.target.files?.[0] ?? null)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="flex items-center justify-center w-full min-h-[120px] border-2 border-dashed border-blue-200 dark:border-blue-900 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 text-slate-500 transition-colors hover:bg-blue-50">
                          <div className="flex flex-col items-center gap-2 pointer-events-none">
                            <Upload className="w-8 h-8 text-blue-400" />
                            <span className="text-sm font-medium">클릭하거나 파일을 여기로 드래그 하세요 (.bin, .img)</span>
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
                        <Button variant="outline" onClick={() => void ota.test()} disabled={!ota.connected || ota.busy || !ota.imageInfo} className="rounded-xl">
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
                               <StatusBadge tone={image.confirmed ? 'success' : 'warning'}>{image.confirmed ? 'Confirmed' : 'Pending'}</StatusBadge>
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

        {/* Logs Drawer overlay using absolute positioning at bottom, or inside layout */}
        {showLogs && (
          <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur-xl border-t shadow-[0_-10px_40px_rgba(0,0,0,0.05)] h-64 flex flex-col z-30 animate-in slide-in-from-bottom-8">
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
 
