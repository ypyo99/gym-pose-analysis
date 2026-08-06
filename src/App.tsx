import { useState, useRef, useEffect } from 'react';
import PoseTracker, { type PoseTrackerRef } from './components/PoseTracker';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import * as htmlToImage from 'html-to-image';
import { Sparkles, Grid3X3, SwitchCamera, Camera, Loader2, Settings, Image as ImageIcon, PersonStanding, Download } from 'lucide-react';

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
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [inputMode, setInputMode] = useState<'camera' | 'photo'>('camera');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const trackerRef = useRef<PoseTrackerRef>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSaveReport = async () => {
    if (!reportRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(reportRef.current, {
        backgroundColor: '#111827', // bg-gray-900
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      const now = new Date();
      const dateStr = now.getFullYear().toString().slice(-2) + 
                      String(now.getMonth() + 1).padStart(2, '0') + 
                      String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + 
                      String(now.getMinutes()).padStart(2, '0') + 
                      String(now.getSeconds()).padStart(2, '0');
      const name = memberName.trim() || '회원';
      link.download = `${name}-AI리포트-${dateStr}-${timeStr}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to save report:', error);
      alert('리포트 저장에 실패했습니다.');
    }
  };

  const handleCapture = () => {
    if (trackerRef.current) {
      trackerRef.current.capture(memberName);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
        setInputMode('photo');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleToggleMode = () => {
    if (inputMode === 'camera') {
      fileInputRef.current?.click();
    } else {
      setInputMode('camera');
      setUploadedImage(null);
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
    setCurrentScreenshot(screenshot);

    try {
      // API 키로 사용 가능한 모델 목록 확인
      let targetModel = "gemini-1.5-flash";
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();
        
        if (data && data.models) {
          const availableModels = data.models.map((m: any) => m.name.replace('models/', ''));
          console.log("Available models for this API key:", availableModels);
          
          const preferredModels = [
            "gemini-flash-latest",
            "gemini-3.5-flash",
            "gemini-3.1-flash",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-pro-latest"
          ];
          const found = preferredModels.find(m => availableModels.includes(m));
          
          if (found) {
            targetModel = found;
          } else {
            const fallback = availableModels.find((m: string) => m.startsWith("gemini") && m.includes("flash") && !m.includes("tts"));
            if (fallback) targetModel = fallback;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch model list, using default.", err);
      }

      console.log(`Using model: ${targetModel}`);
      const genAI = new GoogleGenerativeAI(apiKey);
      const base64Data = screenshot.split(',')[1];
      const currentModeLabel = MODE_CONFIGS.find(m => m.id === mode)?.label || mode;
      
      const prompt = `전문 헬스 트레이너로서 첨부된 사진 속 회원의 '${currentModeLabel}' 자세를 분석해 주세요. 
화면에 표시된 관절의 각도와 위치 가이드라인을 참고하여 다음 내용을 포함해 주세요:
### 1. 현재 자세에서 잘된 점
### 2. 개선이 필요한 점과 그 이유
### 3. 올바른 자세를 위한 구체적인 수정 팁

[작성 가이드라인]
- 현장에서 회원이 빠르게 브리핑을 받을 수 있도록, 내용을 길게 쓰지 말고 각 섹션을 짧은 문장의 불릿 포인트 형태로 핵심만 정리해 주세요.
- 각 불릿 포인트 앞에는 내용과 어울리는 이모지(아이콘)를 반드시 넣어주세요 (예: ✅, 💡, ⚠️, 📌 등).
- 각도를 표시할 때 수학 기호(LaTeX 등, 예: $96^\\circ$)를 절대 사용하지 말고, 평문(예: 96도)으로 자연스럽게 표시해 주세요.
- 반드시 위 3개의 소제목을 마크다운 h3(###) 태그로 시작해서 작성해 주세요.`;

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg"
        }
      };

      const model = genAI.getGenerativeModel({ model: targetModel });
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();
      
      setAnalysisResult(text);
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      alert(`분석 중 오류가 발생했습니다: ${error?.message || '알 수 없는 오류'}\n(F12를 눌러 콘솔 창에서 사용 가능한 모델 목록을 확인해 보세요)`);
    } finally {
      setIsAnalyzing(false);
    }
  };


  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900 font-sans">
      {/* Pose Tracker Component */}
      <div className="absolute inset-0 z-0">
        <PoseTracker 
          ref={trackerRef} 
          mode={mode} 
          showGrid={showGrid} 
          facingMode={facingMode} 
          imageSrc={uploadedImage} 
          viewMode={viewMode}
          onBackgroundClick={() => setShowModes(prev => !prev)}
        />
      </div>

      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        className="hidden" 
      />

      {/* Clickable Overlay for toggling mode buttons */}
      <div 
        className={`absolute inset-0 z-20 ${viewMode === '3d' ? 'pointer-events-none' : ''}`}
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
          className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(236,72,153,0.5)] transition-transform active:scale-90 hover:opacity-90 disabled:opacity-50 text-white"
          title="AI 자세 분석"
        >
          {isAnalyzing ? <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" /> : <Sparkles className="w-6 h-6 md:w-8 md:h-8" />}
        </button>

        {/* Grid Toggle Button */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`w-14 h-14 md:w-16 md:h-16 flex items-center justify-center backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 ${showGrid ? 'bg-blue-500/80 text-white' : 'bg-black/40 text-white hover:bg-black/60'}`}
          title="그리드 표시 토글"
        >
          <Grid3X3 className="w-6 h-6 md:w-8 md:h-8" />
        </button>
        
        {/* 3D View Toggle Button */}
        <button
          onClick={() => setViewMode(prev => prev === '2d' ? '3d' : '2d')}
          className={`w-14 h-14 md:w-16 md:h-16 flex items-center justify-center backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 ${viewMode === '3d' ? 'bg-orange-500/80 text-white' : 'bg-black/40 text-white hover:bg-black/60'}`}
          title="3D 뼈대 뷰어 토글"
        >
          <PersonStanding className="w-6 h-6 md:w-8 md:h-8" />
        </button>
        
        {/* Camera Toggle Button */}
        {inputMode === 'camera' && (
          <button
            onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
            className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 hover:bg-black/60 text-white"
            title="카메라 전/후면 전환"
          >
            <SwitchCamera className="w-6 h-6 md:w-8 md:h-8" />
          </button>
        )}
        
        {/* Mode Toggle Button */}
        <button
          onClick={handleToggleMode}
          className={`w-14 h-14 md:w-16 md:h-16 flex items-center justify-center backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 ${inputMode === 'photo' ? 'bg-green-500/80 text-white' : 'bg-black/40 text-white hover:bg-black/60'}`}
          title="앨범 사진 불러오기"
        >
          {inputMode === 'camera' ? <ImageIcon className="w-6 h-6 md:w-8 md:h-8" /> : <Camera className="w-6 h-6 md:w-8 md:h-8" />}
        </button>
        
        {/* Capture Button */}
        <button
          onClick={handleCapture}
          className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/40 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-transform active:scale-90 hover:bg-black/60 text-white"
          title="현재 화면 캡처"
        >
          <Download className="w-6 h-6 md:w-8 md:h-8" />
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
            className="bg-gray-900 border border-white/20 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 md:p-6 border-b border-white/10 flex justify-between items-center bg-black/30">
              <h2 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-2">
                <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-purple-400" /> AI 자세 분석 리포트
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={handleSaveReport}
                  className="px-4 py-1.5 rounded-full bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 transition-colors shadow-lg"
                >
                  저장
                </button>
                <button 
                  onClick={() => setAnalysisResult(null)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-0 overflow-y-auto custom-scrollbar flex-1 bg-gray-900">
              <div ref={reportRef} className="p-4 md:p-6 bg-gray-900 flex flex-col gap-6">
                {currentScreenshot && (
                  <div className="w-full rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-black">
                    <img src={currentScreenshot} alt="Captured Pose" className="w-full h-auto object-contain max-h-[40vh] mx-auto" />
                  </div>
                )}
                <div className="text-white prose prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      h3: ({node, ...props}) => (
                        <h3 
                          className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-purple-200 px-4 py-3 rounded-xl text-lg md:text-xl font-extrabold mt-8 mb-4 shadow-lg border border-purple-500/30" 
                          {...props} 
                        />
                      ),
                      h2: ({node, ...props}) => (
                        <h2 
                          className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-purple-200 px-4 py-3 rounded-xl text-lg md:text-xl font-extrabold mt-8 mb-4 shadow-lg border border-purple-500/30" 
                          {...props} 
                        />
                      ),
                      h1: ({node, ...props}) => (
                        <h1 
                          className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-purple-200 px-4 py-3 rounded-xl text-lg md:text-xl font-extrabold mt-8 mb-4 shadow-lg border border-purple-500/30" 
                          {...props} 
                        />
                      )
                    }}
                  >
                    {analysisResult}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-gray-900 border border-white/20 rounded-3xl w-full max-w-md p-6 flex flex-col shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Settings className="w-7 h-7 text-gray-300" /> 설정
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
