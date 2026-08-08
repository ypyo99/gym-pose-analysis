import { useState, useRef, useEffect } from 'react';
import PoseTracker, { type PoseTrackerRef } from './components/PoseTracker';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import * as htmlToImage from 'html-to-image';
import { Sparkles, Grid3X3, Camera, Settings, PersonStanding, Download, Dumbbell, Video, Square, X, Upload, RefreshCcw } from 'lucide-react';

export type AppMode = 'photo_capture' | 'video_capture' | 'photo_upload';
export type ExerciseMode = 'squat' | 'deadlift' | 'turtle' | 'asymmetry' | 'plank';

const MODE_CONFIGS: { id: ExerciseMode; label: string; color: string; shadow: string }[] = [
  { id: 'squat', label: '스쿼트', color: 'bg-blue-500', shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.5)]' },
  { id: 'deadlift', label: '데드리프트', color: 'bg-purple-500', shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]' },
  { id: 'plank', label: '플랭크', color: 'bg-red-500', shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]' },
  { id: 'turtle', label: '거북목', color: 'bg-green-500', shadow: 'shadow-[0_0_15px_rgba(34,197,94,0.5)]' },
  { id: 'asymmetry', label: '좌우균형', color: 'bg-orange-500', shadow: 'shadow-[0_0_15px_rgba(249,115,22,0.5)]' },
];

function App() {
  const [appMode, setAppMode] = useState<AppMode>('photo_capture');
  const [mode, setMode] = useState<ExerciseMode>('squat');
  const [memberName, setMemberName] = useState<string>('');
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showUI, setShowUI] = useState<boolean>(true);
  
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  
  const [recordingState, setRecordingState] = useState<'idle' | 'countdown' | 'recording'>('idle');

  const [recordedFrames, setRecordedFrames] = useState<string[]>([]);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [showPoseSelector, setShowPoseSelector] = useState<boolean>(false);

  const trackerRef = useRef<PoseTrackerRef>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKeyInput(savedKey);

    const savedAppMode = localStorage.getItem('appMode') as AppMode;
    if (savedAppMode && ['photo_capture', 'video_capture', 'photo_upload'].includes(savedAppMode)) {
      setAppMode(savedAppMode);
    }
  }, []);

  const handleModeSwitch = (newMode: AppMode) => {
    setAppMode(newMode);
    localStorage.setItem('appMode', newMode);
    handleExit();
  };

  const handleExit = () => {
    setCurrentScreenshot(null);
    setRecordedVideoUrl(null);
    setRecordedFrames([]);
    setUploadedImage(null);
    setUploadedVideo(null);
    setRecordingState('idle');
    setShowPoseSelector(false);
  };

  const handleSaveSettings = () => {
    localStorage.setItem('gemini_api_key', apiKeyInput);
    setShowSettings(false);
  };

  const handleSaveReport = async () => {
    if (!reportRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(reportRef.current, {
        backgroundColor: '#111827',
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
      const formatMemberName = (raw: string) => {
        const trimmed = (raw || '').trim();
        if (!trimmed || trimmed === '회원') return '회원님';
        if (trimmed.endsWith('회원님')) return trimmed;
        if (trimmed.endsWith('회원')) return `${trimmed}님`;
        return `${trimmed} 회원님`;
      };
      const name = formatMemberName(memberName);
      const currentModeLabel = MODE_CONFIGS.find(m => m.id === mode)?.label || mode;
      const filename = `${name}-${currentModeLabel}-AI리포트-${dateStr}-${timeStr}.png`;
      link.download = filename;
      link.href = dataUrl;
      link.click();
      alert(`저장되었습니다!\n\n파일명: ${filename}`);
    } catch (error) {
      console.error('Failed to save report:', error);
      alert('리포트 저장에 실패했습니다.');
    }
  };

  const handleCapturePhoto = () => {
    if (trackerRef.current) {
      const shot = trackerRef.current.getCleanScreenshot() || trackerRef.current.getScreenshot();
      if (shot) setCurrentScreenshot(shot);
    }
  };

  const handleDownloadScreenshot = () => {
    if (!currentScreenshot) return;
    const link = document.createElement('a');
    
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0');
    const timeStr = String(now.getHours()).padStart(2, '0') + 
                    String(now.getMinutes()).padStart(2, '0') + 
                    String(now.getSeconds()).padStart(2, '0');
    const formatMemberName = (raw: string) => {
      const trimmed = (raw || '').trim();
      if (!trimmed || trimmed === '회원') return '회원님';
      if (trimmed.endsWith('회원님')) return trimmed;
      if (trimmed.endsWith('회원')) return `${trimmed}님`;
      return `${trimmed} 회원님`;
    };
    const name = formatMemberName(memberName);
    const currentModeLabel = MODE_CONFIGS.find(m => m.id === mode)?.label || mode;
    
    const filename = `${name}-${currentModeLabel}-캡처-${dateStr}-${timeStr}.jpg`;
    link.download = filename;
    link.href = currentScreenshot;
    link.click();
    alert(`저장되었습니다!\n\n파일명: ${filename}`);
  };

  const startRecordingFlow = () => {
    setRecordedFrames([]);
    setRecordedVideoUrl(null);
    setCurrentScreenshot(null);
    setShowPoseSelector(false);
    
    setRecordingState('recording');
    if (trackerRef.current) {
      trackerRef.current.startRecording();
    }
  };

  const stopRecording = async () => {
    setRecordingState('idle');
    if (trackerRef.current) {
      const { blob, frames } = await trackerRef.current.stopRecording();
      if (blob) {
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
      }
      if (frames && frames.length > 0) {
        setRecordedFrames(frames);
        setCurrentScreenshot(frames[0]);
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVideoFile = file.type.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/i.test(file.name);
      if (isVideoFile) {
        const videoUrl = URL.createObjectURL(file);
        setUploadedVideo(videoUrl);
        setUploadedImage(null);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          setUploadedImage(event.target?.result as string);
          setUploadedVideo(null);
        };
        reader.readAsDataURL(file);
      }
    }
    if (e.target) e.target.value = '';
  };

  const handleAnalyze = async () => {
    if (!trackerRef.current) return;
    
    let framesToAnalyze: string[] = [];
    if (appMode === 'video_capture' && recordedFrames.length > 0) {
      framesToAnalyze = [...recordedFrames];
    } else if (appMode === 'photo_capture' && currentScreenshot) {
      framesToAnalyze.push(currentScreenshot);
    } else if (appMode === 'photo_upload') {
      const shot = trackerRef.current.getScreenshot();
      if (shot) {
        framesToAnalyze.push(shot);
        setCurrentScreenshot(shot);
      }
    }

    if (framesToAnalyze.length === 0) {
      alert("분석할 이미지가 없습니다.");
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
      let targetModel = "gemini-1.5-flash";
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();
        
        if (data && data.models) {
          const availableModels = data.models.map((m: any) => m.name.replace('models/', ''));
          const preferredModels = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro-latest"];
          const found = preferredModels.find(m => availableModels.includes(m));
          
          if (found) targetModel = found;
          else {
            const fallback = availableModels.find((m: string) => m.startsWith("gemini") && m.includes("flash") && !m.includes("tts"));
            if (fallback) targetModel = fallback;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch model list, using default.", err);
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const currentModeLabel = MODE_CONFIGS.find(m => m.id === mode)?.label || mode;
      const isVideo = framesToAnalyze.length > 1;
      
      const prompt = isVideo 
        ? `전문 헬스 트레이너로서 첨부된 연속된 ${framesToAnalyze.length}장의 사진(동영상의 주요 장면) 속 회원의 '${currentModeLabel}' 자세를 분석해 주세요. 
화면에 표시된 관절의 각도와 위치 가이드라인, 그리고 시간의 흐름에 따른 자세 변화를 종합적으로 참고하여 다음 내용을 포함해 주세요:
### 1. 현재 자세에서 잘된 점
### 2. 개선이 필요한 점과 그 이유
### 3. 올바른 자세를 위한 구체적인 수정 팁

[작성 가이드라인]
- 현장에서 회원이 빠르게 브리핑을 받을 수 있도록, 내용을 길게 쓰지 말고 각 섹션을 짧은 문장의 불릿 포인트 형태로 핵심만 정리해 주세요.
- 각 불릿 포인트 앞에는 내용과 어울리는 이모지(아이콘)를 반드시 넣어주세요 (예: ✅, 💡, ⚠️, 📌 등).
- 각도를 표시할 때 수학 기호나 LaTeX(예: $96^\\circ$, 96° 등)를 절대 사용하지 말고, 반드시 '96도'와 같이 한국어 평문으로만 표시해 주세요.
- 오타, 오자, 탈락(생략)된 글자가 전혀 없도록 문장과 글자를 세심하게 검토하여 정확한 완성형 한글 문장으로 작성해 주세요.
- 반드시 위 3개의 소제목을 마크다운 h3(###) 태그로 시작해서 작성해 주세요.`
        : `전문 헬스 트레이너로서 첨부된 사진 속 회원의 '${currentModeLabel}' 자세를 분석해 주세요. 
화면에 표시된 관절의 각도와 위치 가이드라인을 참고하여 다음 내용을 포함해 주세요:
### 1. 현재 자세에서 잘된 점
### 2. 개선이 필요한 점과 그 이유
### 3. 올바른 자세를 위한 구체적인 수정 팁

[작성 가이드라인]
- 현장에서 회원이 빠르게 브리핑을 받을 수 있도록, 내용을 길게 쓰지 말고 각 섹션을 짧은 문장의 불릿 포인트 형태로 핵심만 정리해 주세요.
- 각 불릿 포인트 앞에는 내용과 어울리는 이모지(아이콘)를 반드시 넣어주세요 (예: ✅, 💡, ⚠️, 📌 등).
- 각도를 표시할 때 수학 기호나 LaTeX(예: $96^\\circ$, 96° 등)를 절대 사용하지 말고, 반드시 '96도'와 같이 한국어 평문으로만 표시해 주세요.
- 오타, 오자, 탈락(생략)된 글자가 전혀 없도록 문장과 글자를 세심하게 검토하여 정확한 완성형 한글 문장으로 작성해 주세요.
- 반드시 위 3개의 소제목을 마크다운 h3(###) 태그로 시작해서 작성해 주세요.`;

      const imageParts = framesToAnalyze.map(frame => ({
        inlineData: {
          data: frame.split(',')[1],
          mimeType: "image/jpeg"
        }
      }));

      const model = genAI.getGenerativeModel({ model: targetModel });
      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      
      const rawText = response.text() || '';
      let cleanedText = rawText
        .normalize('NFC')
        .replace(/\$\\text\{([^}]+)\}\$/g, '$1')
        .replace(/\\text\{([^}]+)\}/g, '$1')
        .replace(/\$(\d+(?:\.\d+)?)\^\\circ\$/g, '$1도')
        .replace(/\$(\d+(?:\.\d+)?)\^\circ\$/g, '$1도')
        .replace(/\$(\d+(?:\.\d+)?)°\$/g, '$1도')
        .replace(/(\d+(?:\.\d+)?)°/g, '$1도')
        .replace(/\\circ/g, '도')
        .replace(/\\/g, '');

      setAnalysisResult(cleanedText);
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      const errorMessage = error?.message || '';
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('exceeded')) {
        alert("일일 무료 AI 분석 제공량이 모두 소진되었습니다.\n\n좌측 상단 로고를 클릭하여 발급받으신 개인 Gemini API Key를 입력하시면 계속해서 제한 없이 이용하실 수 있습니다.");
        setShowSettings(true);
      } else {
        alert(`분석 중 오류가 발생했습니다: ${errorMessage || '알 수 없는 오류'}\n(네트워크 연결 상태를 확인하시거나 잠시 후 다시 시도해 주세요)`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900 font-sans touch-none">
      {/* Pose Tracker Component */}
      <div className="absolute inset-0 z-0">
        <PoseTracker 
          ref={trackerRef} 
          mode={mode} 
          showGrid={showGrid} 
          showUI={showUI}
          facingMode={facingMode} 
          imageSrc={appMode === 'photo_upload' ? uploadedImage : (appMode === 'photo_capture' && currentScreenshot ? currentScreenshot : null)} 
          videoSrc={appMode === 'photo_upload' ? uploadedVideo : (appMode === 'video_capture' && recordedVideoUrl ? recordedVideoUrl : null)}
          isUploadMode={appMode === 'photo_upload' || (appMode === 'video_capture' && !!recordedVideoUrl) || (appMode === 'photo_capture' && !!currentScreenshot)}
          viewMode={viewMode}
          onBackgroundClick={() => {
            setShowPoseSelector(false);
            setShowUI(prev => !prev);
          }}
        />
      </div>

      <input 
        type="file" 
        accept="image/*,video/*" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        className="hidden" 
      />

      {/* Viewing / Playback Badge */}
      {((appMode === 'photo_capture' && currentScreenshot) || (appMode === 'video_capture' && recordedVideoUrl) || (appMode === 'photo_upload' && (uploadedImage || uploadedVideo))) && (
        <div className="absolute bottom-28 z-30 pointer-events-none flex justify-center w-full">
          <div className="bg-black/70 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 shadow-lg flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-white font-bold text-lg tracking-wider">재생 중...</span>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className={`absolute top-0 left-0 w-full p-3 md:p-4 z-30 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${showUI ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3 md:gap-4">
          <img 
            src="/logo.jpg" 
            alt="PT Shop Logo" 
            onClick={() => setShowSettings(true)}
            className="w-12 h-12 md:w-16 md:h-16 object-cover rounded-lg shadow-lg opacity-90 hover:opacity-100 transition-opacity cursor-pointer active:scale-95" 
          />
          <div className="h-12 md:h-16 flex items-center gap-2 md:gap-3 bg-black/60 backdrop-blur-md px-3 md:px-4 rounded-lg border border-white/10 shadow-lg">
            <Dumbbell className="w-5 h-5 md:w-7 md:h-7 text-cyan-400 shrink-0" />
            <div className="flex flex-col justify-center leading-none">
              <span className="text-[11px] sm:text-xs md:text-sm font-black tracking-widest text-cyan-400 uppercase">
                AI PT
              </span>
              <span className="text-xs sm:text-sm md:text-base font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 uppercase mt-0.5">
                STUDIO
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <input
            type="text"
            placeholder="회원 이름"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            className="w-24 md:w-36 lg:w-48 px-3 py-1 md:px-5 md:py-2 bg-black/60 backdrop-blur-md rounded-full text-white text-sm md:text-xl font-bold border border-white/30 outline-none focus:bg-black/80 placeholder-gray-400 text-center shadow-md transition-all"
          />
        </div>
      </div>

      {/* Mode Selection Tabs */}
      <div className={`absolute top-20 left-0 w-full z-40 flex justify-center px-4 transition-opacity duration-300 ${showUI ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/20 shadow-lg">
          <button 
            onClick={() => handleModeSwitch('photo_capture')}
            className={`px-4 py-2 rounded-full text-sm md:text-base font-bold transition-colors ${appMode === 'photo_capture' ? 'bg-white text-black' : 'text-gray-300 hover:text-white'}`}
          >
            사진 촬영
          </button>
          <button 
            onClick={() => handleModeSwitch('video_capture')}
            className={`px-4 py-2 rounded-full text-sm md:text-base font-bold transition-colors ${appMode === 'video_capture' ? 'bg-white text-black' : 'text-gray-300 hover:text-white'}`}
          >
            동영상 촬영
          </button>
          <button 
            onClick={() => handleModeSwitch('photo_upload')}
            className={`px-4 py-2 rounded-full text-sm md:text-base font-bold transition-colors ${appMode === 'photo_upload' ? 'bg-white text-black' : 'text-gray-300 hover:text-white'}`}
          >
            업로드
          </button>
        </div>
      </div>

      {/* Pose Selector Overlay */}
      {showPoseSelector && (
        <div className={`absolute bottom-40 left-0 w-full z-30 flex justify-center px-4 transition-opacity duration-300 ${showUI ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="grid grid-cols-3 md:flex gap-2 md:gap-4 justify-center w-full max-w-sm md:max-w-2xl bg-black/80 backdrop-blur-md p-4 rounded-3xl border border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            {MODE_CONFIGS.map((config) => (
              <button
                key={config.id}
                onClick={() => { setMode(config.id); setShowPoseSelector(false); }}
                className={`py-3 md:py-4 px-2 md:px-6 rounded-2xl font-bold text-sm md:text-lg transition-all transform active:scale-95 whitespace-nowrap ${
                  mode === config.id
                    ? `${config.color} text-white ${config.shadow}`
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      <div className={`absolute bottom-0 left-0 w-full p-6 z-40 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center justify-end min-h-[150px] transition-opacity duration-300 ${showUI ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        
        {/* Photo Capture Mode Controls */}
        {appMode === 'photo_capture' && (
          <div className="flex items-center justify-center gap-4 md:gap-6 w-full px-2 md:px-8">
            {!currentScreenshot ? (
              <>
                <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-50">
                  <button onClick={() => setShowPoseSelector(p => !p)} className={`shrink-0 px-4 py-3 md:px-6 md:py-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center font-bold ${showPoseSelector ? 'bg-purple-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="운동 종목 선택">
                    <span className="text-sm md:text-lg whitespace-nowrap">{MODE_CONFIGS.find(m => m.id === mode)?.label}</span>
                  </button>
                  <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 bg-black/60 text-white hover:bg-black/80 flex items-center justify-center" title="카메라 전환">
                    <RefreshCcw className="w-6 h-6 md:w-8 md:h-8" />
                  </button>
                  <button onClick={() => setShowGrid(!showGrid)} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${showGrid ? 'bg-blue-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="그리드"><Grid3X3 className="w-6 h-6 md:w-8 md:h-8" /></button>
                  <button onClick={() => setViewMode(v => v === '2d' ? '3d' : '2d')} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${viewMode === '3d' ? 'bg-orange-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="골격 표시 (3D)"><PersonStanding className="w-6 h-6 md:w-8 md:h-8" /></button>
                </div>
                <div className="flex items-center justify-center w-full">
                  <button onClick={handleCapturePhoto} className="p-4 md:p-5 rounded-full bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] transition-transform active:scale-90 hover:bg-red-600 flex items-center justify-center" title="촬영"><Camera className="w-6 h-6 md:w-8 md:h-8 text-white fill-current" /></button>
                </div>
              </>
            ) : (
              <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-50">
                <button onClick={() => setShowPoseSelector(p => !p)} className={`shrink-0 px-4 py-3 md:px-6 md:py-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center font-bold ${showPoseSelector ? 'bg-purple-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="운동 종목 선택">
                  <span className="text-sm md:text-lg whitespace-nowrap">{MODE_CONFIGS.find(m => m.id === mode)?.label}</span>
                </button>
                <button onClick={handleAnalyze} className="shrink-0 p-4 md:p-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center text-white hover:opacity-90"><Sparkles className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={handleDownloadScreenshot} className="shrink-0 p-4 rounded-full bg-blue-600 border border-white/40 shadow-lg transition-transform active:scale-95 hover:bg-blue-700 text-white flex items-center justify-center" title="다운로드"><Download className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={() => setShowGrid(!showGrid)} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${showGrid ? 'bg-blue-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="그리드"><Grid3X3 className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={() => setViewMode(v => v === '2d' ? '3d' : '2d')} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${viewMode === '3d' ? 'bg-orange-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="골격 표시 (3D)"><PersonStanding className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={handleExit} className="shrink-0 p-4 rounded-full bg-gray-600 border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center hover:bg-gray-700 text-white" title="취소"><X className="w-6 h-6 md:w-8 md:h-8" /></button>
              </div>
            )}
          </div>
        )}

        {/* Video Capture Mode Controls */}
        {appMode === 'video_capture' && (
          <div className="flex items-center justify-center gap-4 md:gap-6 w-full px-2 md:px-8">
            {!recordedVideoUrl ? (
              recordingState === 'recording' ? (
                <div className="flex items-center justify-center w-full">
                  <button onClick={stopRecording} className="p-4 md:p-5 rounded-full bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.5)] transition-transform active:scale-90 animate-pulse hover:bg-red-700" title="정지"><Square className="w-6 h-6 md:w-8 md:h-8 text-white fill-current" /></button>
                </div>
              ) : (
                <>
                  <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-50">
                    <button onClick={() => setShowPoseSelector(p => !p)} className={`shrink-0 px-4 py-3 md:px-6 md:py-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center font-bold ${showPoseSelector ? 'bg-purple-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="운동 종목 선택">
                      <span className="text-sm md:text-lg whitespace-nowrap">{MODE_CONFIGS.find(m => m.id === mode)?.label}</span>
                    </button>
                    <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 bg-black/60 text-white hover:bg-black/80 flex items-center justify-center" title="카메라 전환">
                      <RefreshCcw className="w-6 h-6 md:w-8 md:h-8" />
                    </button>
                    <button onClick={() => setShowGrid(!showGrid)} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${showGrid ? 'bg-blue-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="그리드"><Grid3X3 className="w-6 h-6 md:w-8 md:h-8" /></button>
                    <button onClick={() => setViewMode(v => v === '2d' ? '3d' : '2d')} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${viewMode === '3d' ? 'bg-orange-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="골격 표시 (3D)"><PersonStanding className="w-6 h-6 md:w-8 md:h-8" /></button>
                  </div>
                  <div className="flex items-center justify-center w-full">
                    <button onClick={startRecordingFlow} disabled={recordingState === 'countdown'} className={`p-4 md:p-5 rounded-full ${recordingState === 'countdown' ? 'bg-gray-500' : 'bg-red-500 hover:bg-red-600'} shadow-[0_0_20px_rgba(239,68,68,0.5)] transition-transform active:scale-90 flex items-center justify-center`} title="녹화"><Video className="w-6 h-6 md:w-8 md:h-8 text-white fill-current" /></button>
                  </div>
                </>
              )
            ) : (
              <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-50">
                <button onClick={() => setShowPoseSelector(p => !p)} className={`shrink-0 px-4 py-3 md:px-6 md:py-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center font-bold ${showPoseSelector ? 'bg-purple-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="운동 종목 선택">
                  <span className="text-sm md:text-lg whitespace-nowrap">{MODE_CONFIGS.find(m => m.id === mode)?.label}</span>
                </button>
                <button onClick={handleAnalyze} className="shrink-0 p-4 md:p-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center text-white hover:opacity-90"><Sparkles className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={() => {
                   const link = document.createElement('a');
                   const now = new Date();
                   const dateStr = now.getFullYear().toString().slice(-2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
                   const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
                   const formatMemberName = (raw: string) => {
                     const trimmed = (raw || '').trim();
                     if (!trimmed || trimmed === '회원') return '회원님';
                     if (trimmed.endsWith('회원님')) return trimmed;
                     if (trimmed.endsWith('회원')) return `${trimmed}님`;
                     return `${trimmed} 회원님`;
                   };
                   const name = formatMemberName(memberName);
                   const currentModeLabel = MODE_CONFIGS.find(m => m.id === mode)?.label || mode;
                   const filename = `${name}-${currentModeLabel}-영상-${dateStr}-${timeStr}.webm`;
                   link.download = filename;
                   link.href = recordedVideoUrl;
                   link.click();
                   alert(`저장되었습니다!\n\n파일명: ${filename}`);
                }} className="shrink-0 p-4 rounded-full bg-blue-600 border border-white/40 shadow-lg transition-transform active:scale-95 hover:bg-blue-700 text-white flex items-center justify-center" title="다운로드"><Download className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={() => setShowGrid(!showGrid)} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${showGrid ? 'bg-blue-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="그리드"><Grid3X3 className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={() => setViewMode(v => v === '2d' ? '3d' : '2d')} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${viewMode === '3d' ? 'bg-orange-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="골격 표시 (3D)"><PersonStanding className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={handleExit} className="shrink-0 p-4 rounded-full bg-gray-600 border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center hover:bg-gray-700 text-white" title="취소"><X className="w-6 h-6 md:w-8 md:h-8" /></button>
              </div>
            )}
          </div>
        )}

        {/* Photo Upload Mode Controls */}
        {appMode === 'photo_upload' && (
          <div className="flex items-center justify-center gap-4 md:gap-6 w-full">
            {!uploadedImage && !uploadedVideo ? (
              <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3.5 md:px-7 md:py-4 rounded-full bg-blue-600 border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center gap-2.5 text-white font-bold text-base md:text-lg hover:bg-blue-700"><Upload className="w-6 h-6 md:w-7 md:h-7" /> 앨범에서 사진/동영상 선택</button>
            ) : (
              <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-50">
                <button onClick={() => setShowPoseSelector(p => !p)} className={`shrink-0 px-4 py-3 md:px-6 md:py-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center font-bold ${showPoseSelector ? 'bg-purple-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="운동 종목 선택">
                  <span className="text-sm md:text-lg whitespace-nowrap">{MODE_CONFIGS.find(m => m.id === mode)?.label}</span>
                </button>
                <button onClick={handleAnalyze} className="shrink-0 p-4 md:p-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center text-white hover:opacity-90"><Sparkles className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={() => {
                  const shot = trackerRef.current?.getScreenshot();
                  if (shot) {
                    const link = document.createElement('a');
                    const now = new Date();
                    const dateStr = now.getFullYear().toString().slice(-2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
                    const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
                    const formatMemberName = (raw: string) => {
                      const trimmed = (raw || '').trim();
                      if (!trimmed || trimmed === '회원') return '회원님';
                      if (trimmed.endsWith('회원님')) return trimmed;
                      if (trimmed.endsWith('회원')) return `${trimmed}님`;
                      return `${trimmed} 회원님`;
                    };
                    const name = formatMemberName(memberName);
                    const currentModeLabel = MODE_CONFIGS.find(m => m.id === mode)?.label || mode;
                    const typeLabel = uploadedVideo ? '동영상' : '사진';
                    const filename = `${name}-${currentModeLabel}-${typeLabel}-${dateStr}-${timeStr}.png`;
                    link.download = filename;
                    link.href = shot;
                    link.click();
                    alert(`저장되었습니다!\n\n파일명: ${filename}`);
                  }
                }} className="shrink-0 p-4 rounded-full bg-blue-600 border border-white/40 shadow-lg transition-transform active:scale-95 hover:bg-blue-700 text-white flex items-center justify-center" title="다운로드"><Download className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={() => setShowGrid(!showGrid)} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${showGrid ? 'bg-blue-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="그리드"><Grid3X3 className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={() => setViewMode(v => v === '2d' ? '3d' : '2d')} className={`shrink-0 p-4 rounded-full border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center ${viewMode === '3d' ? 'bg-orange-500/80 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`} title="골격 표시 (3D)"><PersonStanding className="w-6 h-6 md:w-8 md:h-8" /></button>
                <button onClick={handleExit} className="shrink-0 p-4 rounded-full bg-gray-600 border border-white/40 shadow-lg transition-transform active:scale-95 flex items-center justify-center hover:bg-gray-700 text-white" title="취소 (사진 다시 선택)"><X className="w-6 h-6 md:w-8 md:h-8" /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recording Indicator */}
      {recordingState === 'recording' && (
        <div className={`absolute top-24 right-6 z-40 flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full border border-red-500/50 backdrop-blur-md pointer-events-none transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <span className="text-white font-bold text-sm md:text-base">REC</span>
        </div>
      )}

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
            <div className="p-3 md:p-6 border-b border-white/10 flex justify-between items-center bg-black/30 gap-2 overflow-hidden">
              <h2 className="text-sm sm:text-lg md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-1.5 md:gap-2 whitespace-nowrap truncate">
                <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 text-purple-400 shrink-0" /> 
                <span className="truncate">AI 자세 분석 리포트</span>
                <span className="text-xs sm:text-base md:text-lg text-purple-200/70 font-medium shrink-0 ml-0.5 md:ml-1">
                  ({MODE_CONFIGS.find(c => c.id === mode)?.label})
                </span>
              </h2>
              <div className="flex gap-1.5 md:gap-2 shrink-0">
                <button 
                  onClick={handleSaveReport}
                  className="px-3 md:px-4 py-1 md:py-1.5 rounded-full bg-purple-600 text-white font-bold text-xs md:text-sm hover:bg-purple-700 transition-colors shadow-lg whitespace-nowrap shrink-0"
                >
                  저장
                </button>
                <button 
                  onClick={() => setAnalysisResult(null)}
                  className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors shrink-0"
                >
                  <span className="text-sm md:text-base">✕</span>
                </button>
              </div>
            </div>
            <div className="p-0 overflow-y-auto custom-scrollbar flex-1 bg-gray-900">
              <div ref={reportRef} className="p-4 md:p-6 bg-gray-900 flex flex-col gap-6">
                <div className="flex items-center justify-center gap-2 md:gap-3 pb-2 md:pb-4 border-b border-white/10">
                  <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-purple-400 shrink-0" /> 
                  <h2 className="text-xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 text-center">
                    AI 자세 분석 리포트 
                    <span className="text-base md:text-xl text-purple-200/70 font-bold ml-2">
                      ({MODE_CONFIGS.find(c => c.id === mode)?.label})
                    </span>
                  </h2>
                </div>

                {appMode === 'video_capture' && recordedFrames.length > 1 ? (
                  <div className="flex flex-col w-full gap-4 pb-2">
                    {recordedFrames.map((frame, idx) => (
                      <div key={idx} className="w-full rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-black">
                        <img src={frame} alt={`Frame ${idx + 1}`} className="w-full h-auto object-contain max-h-[40vh] mx-auto" />
                      </div>
                    ))}
                  </div>
                ) : currentScreenshot ? (
                  <div className="w-full rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-black">
                    <img src={currentScreenshot} alt="Captured Pose" className="w-full h-auto object-contain max-h-[40vh] mx-auto" />
                  </div>
                ) : null}
                <div className="text-white prose prose-invert max-w-none break-keep leading-relaxed">
                  <ReactMarkdown
                    components={{
                      h3: ({node, ...props}) => <h3 className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-purple-200 px-4 py-3 rounded-xl text-lg md:text-xl font-extrabold mt-8 mb-4 shadow-lg border border-purple-500/30" {...props} />,
                      h2: ({node, ...props}) => <h2 className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-purple-200 px-4 py-3 rounded-xl text-lg md:text-xl font-extrabold mt-8 mb-4 shadow-lg border border-purple-500/30" {...props} />,
                      h1: ({node, ...props}) => <h1 className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-purple-200 px-4 py-3 rounded-xl text-lg md:text-xl font-extrabold mt-8 mb-4 shadow-lg border border-purple-500/30" {...props} />
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
              <div className="mt-3">
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-purple-400 hover:text-purple-300 underline underline-offset-4"
                >
                  👉 구글 AI 스튜디오에서 무료 API Key 발급받기
                </a>
              </div>
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
