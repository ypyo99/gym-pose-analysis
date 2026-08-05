import { useState, useRef } from 'react';
import PoseTracker, { type PoseTrackerRef } from './components/PoseTracker';

export type ExerciseMode = 'squat' | 'deadlift' | 'turtle' | 'asymmetry' | 'plank';

const MODE_CONFIGS: { id: ExerciseMode; label: string; color: string; shadow: string }[] = [
  { id: 'squat', label: '스쿼트', color: 'bg-blue-500', shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.5)]' },
  { id: 'deadlift', label: '데드리프트', color: 'bg-purple-500', shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]' },
  { id: 'turtle', label: '거북목', color: 'bg-green-500', shadow: 'shadow-[0_0_15px_rgba(34,197,94,0.5)]' },
  { id: 'asymmetry', label: '좌우균형', color: 'bg-orange-500', shadow: 'shadow-[0_0_15px_rgba(249,115,22,0.5)]' },
  { id: 'plank', label: '플랭크', color: 'bg-red-500', shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]' },
];

function App() {
  const [mode, setMode] = useState<ExerciseMode>('squat');
  const [memberName, setMemberName] = useState<string>('');
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showModes, setShowModes] = useState<boolean>(false);
  const trackerRef = useRef<PoseTrackerRef>(null);

  const handleCapture = () => {
    if (trackerRef.current) {
      trackerRef.current.capture(memberName);
    }
  };


  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900 font-sans">
      {/* Tracker Component */}
      <PoseTracker ref={trackerRef} mode={mode} showGrid={showGrid} />

      {/* Clickable Overlay for toggling mode buttons */}
      <div 
        className="absolute inset-0 z-20" 
        onClick={() => setShowModes(prev => !prev)} 
      />

      {/* UI Overlay - Top Area (Logo/Title) */}
      <div className="absolute top-0 left-0 w-full p-3 md:p-4 z-30 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3 md:gap-4">
          <img src="/logo.jpg" alt="PT Shop Logo" className="w-12 h-12 md:w-16 md:h-16 object-cover rounded-2xl shadow-lg opacity-90 hover:opacity-100 transition-opacity" />
          <h1 className="text-white text-lg md:text-2xl lg:text-3xl font-bold tracking-wider">AI PT STUDIO</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <input
            type="text"
            placeholder="회원 이름"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            className="w-24 md:w-36 lg:w-48 px-3 py-1 md:px-5 md:py-2 bg-white/20 backdrop-blur-md rounded-full text-white text-sm md:text-xl font-bold border border-white/30 outline-none focus:bg-white/30 placeholder-gray-300 text-center shadow-md transition-all"
          />
        </div>
      </div>

      {/* Side Action Buttons */}
      <div className={`absolute bottom-40 md:bottom-32 right-4 md:right-6 z-40 flex flex-col gap-3 md:gap-4 transition-all duration-300 ${showModes ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'}`}>
        {/* Grid Toggle Button */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`w-14 h-14 md:w-16 md:h-16 text-2xl md:text-3xl flex items-center justify-center backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 ${showGrid ? 'bg-blue-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
          title="그리드 표시 토글"
        >
          📐
        </button>
        
        {/* Capture Button */}
        <button
          onClick={handleCapture}
          className="w-14 h-14 md:w-16 md:h-16 text-2xl md:text-3xl flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 hover:bg-white/30"
          title="현재 화면 캡처"
        >
          📸
        </button>
      </div>

      {/* UI Overlay - Bottom Area (Controls) */}
      <div className={`absolute bottom-0 left-0 w-full p-4 md:p-6 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-all duration-300 ${showModes ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
        <div className="grid grid-cols-3 md:flex gap-2 md:gap-4 justify-center w-full max-w-sm md:max-w-2xl mx-auto">
          {MODE_CONFIGS.map((config) => (
            <button
              key={config.id}
              onClick={() => setMode(config.id)}
              className={`py-3 md:py-4 px-2 md:px-6 rounded-2xl font-bold text-sm md:text-lg transition-all transform active:scale-95 whitespace-nowrap ${
                mode === config.id
                  ? `${config.color} text-white ${config.shadow}`
                  : 'bg-white/10 text-gray-300 backdrop-blur-md hover:bg-white/20'
              }`}
            >
              {config.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
