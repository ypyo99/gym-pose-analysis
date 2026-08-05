import { useState, useRef, useEffect } from 'react';
import PoseTracker, { type PoseTrackerRef } from './components/PoseTracker';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';

export type ExerciseMode = 'squat' | 'deadlift' | 'turtle' | 'asymmetry' | 'plank';

const MODE_CONFIGS: { id: ExerciseMode; label: string; color: string; shadow: string }[] = [
  { id: 'squat', label: '스쿼트', color: 'bg-blue-500', shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.5)]' },
  { id: 'deadlift', label: '데드리프트', color: 'bg-purple-500', shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]' },
  { id: 'plank', label: '플랭크', color: 'bg-red-500', shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]' },
  { id: 'turtle', label: '거북목', color: 'bg-green-500', shadow: 'shadow-[0_0_15px_rgba(34,197,94,0.5)]' },
  { id: 'asymmetry', label: '좌우균형', color: 'bg-orange-500', shadow: 'shadow-[0_0_15px_rgba(249,115,22,0.5)]' },
];

function App() {
  const [mode, setMode] = useState<ExerciseMode>('squat');
  const [memberName, setMemberName] = useState<string>('');
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showModes, setShowModes] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const trackerRef = useRef<PoseTrackerRef>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKeyInput(savedKey);
    }
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('gemini_api_key', apiKeyInput);
    setShowSettings(false);
  };

  const handleCapture = () => {
    if (trackerRef.current) {
      trackerRef.current.capture(memberName);
    }
  };

  const handleAnalyze = async () => {
    if (!trackerRef.current) return;
    
    const screenshot = trackerRef.current.getScreenshot();
    if (!screenshot) {
      alert("화면을 캡처할 수 없습니다.");
      return;
    }

    const savedKey = localStorage.getItem('gemini_api_key');
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    const apiKey = savedKey || (envKey !== 'your_gemini_api_key_here' ? envKey : null);
    
    if (!apiKey) {
      alert("좌측 상단 로고를 클릭하여 Gemini API Key를 설정해주세요.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const base64Data = screenshot.split(',')[1];
      const currentModeLabel = MODE_CONFIGS.find(m => m.id === mode)?.label || mode;
      
      const prompt = `전문 헬스 트레이너로서 첨부된 사진 속 회원의 '${currentModeLabel}' 자세를 분석해 주세요. 
화면에 표시된 관절의 각도와 위치 가이드라인을 참고하여 다음 내용을 포함해 주세요:
1. 현재 자세에서 잘된 점 (칭찬)
2. 개선이 필요한 점과 그 이유
3. 올바른 자세를 위한 구체적인 수정 팁 (3~4줄로 명확하고 친절하게)
마크다운 형식으로 보기 좋게 작성해 주세요.`;

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg"
        }
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();
      
      setAnalysisResult(text);
    } catch (error) {
      console.error("AI Analysis Error:", error);
      alert("분석 중 오류가 발생했습니다. API 키나 네트워크 상태를 확인해주세요.");
    } finally {
      setIsAnalyzing(false);
    }
  };


  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900 font-sans">
      {/* Tracker Component */}
      <PoseTracker ref={trackerRef} mode={mode} showGrid={showGrid} facingMode={facingMode} />

      {/* Clickable Overlay for toggling mode buttons */}
      <div 
        className="absolute inset-0 z-20" 
        onClick={() => setShowModes(prev => !prev)} 
      />

      {/* UI Overlay - Top Area (Logo/Title) */}
      <div className="absolute top-0 left-0 w-full p-3 md:p-4 z-30 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3 md:gap-4">
          <img 
            src="/logo.jpg" 
            alt="PT Shop Logo" 
            onClick={() => setShowSettings(true)}
            className="w-12 h-12 md:w-16 md:h-16 object-cover rounded-2xl shadow-lg opacity-90 hover:opacity-100 transition-opacity cursor-pointer active:scale-95" 
          />
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
        {/* AI Analyze Button */}
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="w-14 h-14 md:w-16 md:h-16 text-2xl md:text-3xl flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(236,72,153,0.5)] transition-transform active:scale-90 hover:opacity-90 disabled:opacity-50"
          title="AI 자세 분석"
        >
          {isAnalyzing ? '⏳' : '🤖'}
        </button>

        {/* Grid Toggle Button */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`w-14 h-14 md:w-16 md:h-16 text-2xl md:text-3xl flex items-center justify-center backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 ${showGrid ? 'bg-blue-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
          title="그리드 표시 토글"
        >
          📐
        </button>
        
        {/* Camera Toggle Button */}
        <button
          onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
          className="w-14 h-14 md:w-16 md:h-16 text-2xl md:text-3xl flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 hover:bg-white/30 text-white"
          title="카메라 전/후면 전환"
        >
          🔄
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

      {/* AI Analyzing Loading Modal */}
      {isAnalyzing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white/10 p-8 rounded-3xl border border-white/20 flex flex-col items-center shadow-2xl">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-white text-xl font-bold">AI 트레이너가 자세를 분석 중입니다...</p>
            <p className="text-gray-300 text-sm mt-2">잠시만 기다려주세요</p>
          </div>
        </div>
      )}

      {/* AI Analysis Result Modal */}
      {analysisResult && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/70 backdrop-blur-md" onClick={() => setAnalysisResult(null)}>
          <div 
            className="bg-gray-900 border border-white/20 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 md:p-6 border-b border-white/10 flex justify-between items-center bg-black/30">
              <h2 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-2">
                🤖 AI 자세 분석 리포트
              </h2>
              <button 
                onClick={() => setAnalysisResult(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar text-white prose prose-invert max-w-none">
              <ReactMarkdown>{analysisResult}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-gray-900 border border-white/20 rounded-3xl w-full max-w-md p-6 flex flex-col shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              ⚙️ 설정
            </h2>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Gemini API Key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AI Studio에서 발급받은 API Key 입력"
                className="w-full px-4 py-3 bg-black/50 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <p className="text-xs text-gray-400 mt-2">
                입력하신 키는 브라우저 로컬 스토리지에만 안전하게 저장됩니다.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-5 py-2 rounded-xl text-white bg-white/10 hover:bg-white/20 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-5 py-2 rounded-xl text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/30 font-bold"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
