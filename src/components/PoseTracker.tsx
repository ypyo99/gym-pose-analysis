import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import Webcam from 'react-webcam';
import type { Results } from '@mediapipe/pose';
import { calculateAngle, type Point } from '../utils/angleUtils';

const Pose = (window as any).Pose;
const POSE_CONNECTIONS = (window as any).POSE_CONNECTIONS;
const drawConnectors = (window as any).drawConnectors;
const drawLandmarks = (window as any).drawLandmarks;

interface PoseTrackerProps {
  mode: 'squat' | 'deadlift' | 'turtle' | 'asymmetry' | 'plank';
  showGrid?: boolean;
  facingMode?: 'user' | 'environment';
}

export interface PoseTrackerRef {
  capture: (memberName: string) => void;
}

const PoseTracker = forwardRef<PoseTrackerRef, PoseTrackerProps>(({ mode, showGrid = false, facingMode = 'user' }, ref) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [feedbackColor, setFeedbackColor] = useState<string>('text-white');

  useImperativeHandle(ref, () => ({
    capture: (memberName: string) => {
      if (!webcamRef.current || !webcamRef.current.video || !canvasRef.current) return;
      const video = webcamRef.current.video;
      const overlayCanvas = canvasRef.current;
      
      const offCanvas = document.createElement('canvas');
      offCanvas.width = video.videoWidth;
      offCanvas.height = video.videoHeight;
      const ctx = offCanvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
      ctx.drawImage(overlayCanvas, 0, 0, offCanvas.width, offCanvas.height);
      
      const dataUrl = offCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      
      const now = new Date();
      const dateStr = now.getFullYear().toString().slice(-2) + 
                      String(now.getMonth() + 1).padStart(2, '0') + 
                      String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + 
                      String(now.getMinutes()).padStart(2, '0') + 
                      String(now.getSeconds()).padStart(2, '0');
      
      const name = memberName.trim() || '회원';
      link.download = `${name}-${dateStr}-${timeStr}.png`;
      link.href = dataUrl;
      link.click();
    }
  }));

  const onResults = useCallback((results: Results) => {
    if (!canvasRef.current || !webcamRef.current?.video) return;

    const videoWidth = webcamRef.current.video.videoWidth;
    const videoHeight = webcamRef.current.video.videoHeight;

    canvasRef.current.width = videoWidth;
    canvasRef.current.height = videoHeight;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Draw the original video frame without background removal
    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Draw Posture Grid
    if (showGrid) {
      canvasCtx.save();
      canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Slightly more visible white
      const gridLineWidth = Math.max(4, Math.floor(videoWidth / 200));
      canvasCtx.lineWidth = gridLineWidth;

      // Draw vertical lines
      const cols = 8;
      const colWidth = videoWidth / cols;
      for (let i = 1; i < cols; i++) {
        canvasCtx.beginPath();
        canvasCtx.moveTo(i * colWidth, 0);
        canvasCtx.lineTo(i * colWidth, videoHeight);
        canvasCtx.stroke();
      }

      // Draw horizontal lines
      const rows = 6;
      const rowHeight = videoHeight / rows;
      for (let i = 1; i < rows; i++) {
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, i * rowHeight);
        canvasCtx.lineTo(videoWidth, i * rowHeight);
        canvasCtx.stroke();
      }

      // Draw strong center vertical line for symmetry check
      canvasCtx.strokeStyle = 'rgba(0, 255, 255, 0.6)'; // Cyan
      canvasCtx.lineWidth = gridLineWidth;
      canvasCtx.beginPath();
      canvasCtx.moveTo(videoWidth / 2, 0);
      canvasCtx.lineTo(videoWidth / 2, videoHeight);
      canvasCtx.stroke();
      
      // Draw strong center horizontal line
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, videoHeight / 2);
      canvasCtx.lineTo(videoWidth, videoHeight / 2);
      canvasCtx.stroke();

      canvasCtx.restore();
    }
    
    if (results.poseLandmarks) {
      // Create a copy for drawing, hiding facial landmarks (0-10) for a cleaner UI
      // and hiding fingers (17-22) and feet/toes (29-32)
      const landmarksToDraw = results.poseLandmarks.map((lm, index) => {
        if (
          (index >= 0 && index <= 10) || // face
          (index >= 17 && index <= 22) || // hands/fingers
          (index >= 29 && index <= 32)    // feet/toes
        ) {
          return { ...lm, visibility: 0 };
        }
        return lm;
      });

      // Dynamically scale sizes based on video resolution (so it looks bold even in 4K)
      const lineThickness = Math.max(8, Math.floor(videoWidth / 120));
      const dotRadius = Math.max(12, Math.floor(videoWidth / 80));

      // Draw skeleton
      drawConnectors(canvasCtx, landmarksToDraw, POSE_CONNECTIONS, {
        color: '#00FF00',
        lineWidth: lineThickness,
      });
      drawLandmarks(canvasCtx, landmarksToDraw, {
        color: '#FF0000',
        lineWidth: Math.max(3, Math.floor(lineThickness / 2)),
        radius: dotRadius,
      });

      const baseFontSize = Math.max(18, Math.floor(videoWidth / 30));
      const strokeWidth = Math.max(3, Math.floor(baseFontSize / 6));

      // Calculate squat angle
      if (mode === 'squat') {
        const hip = results.poseLandmarks[24]; // Right hip
        const knee = results.poseLandmarks[26]; // Right knee
        const ankle = results.poseLandmarks[28]; // Right ankle

        if (hip && knee && ankle && hip.visibility! > 0.5 && knee.visibility! > 0.5 && ankle.visibility! > 0.5) {
          const p1: Point = { x: hip.x * videoWidth, y: hip.y * videoHeight };
          const p2: Point = { x: knee.x * videoWidth, y: knee.y * videoHeight };
          const p3: Point = { x: ankle.x * videoWidth, y: ankle.y * videoHeight };
          const angle = calculateAngle(p1, p2, p3);

          // Draw angle text near knee
          canvasCtx.font = `900 ${baseFontSize}px Arial`;
          canvasCtx.strokeStyle = '#000000';
          canvasCtx.lineWidth = strokeWidth;
          canvasCtx.strokeText(`${Math.round(angle)}°`, p2.x + 20, p2.y);
          canvasCtx.fillStyle = '#FFFFFF';
          canvasCtx.fillText(`${Math.round(angle)}°`, p2.x + 20, p2.y);

          if (angle > 160) {
            setFeedback('준비 자세');
            setFeedbackColor('text-blue-400');
          } else if (angle < 90) {
            setFeedback('Perfect! 좋은 깊이입니다');
            setFeedbackColor('text-green-400');
          } else {
            setFeedback('더 깊게 앉으세요');
            setFeedbackColor('text-yellow-400');
          }
        } else {
          setFeedback('전신(측면)이 화면에 보이게 해주세요');
          setFeedbackColor('text-white');
        }
      } else if (mode === 'deadlift') {
        const ear = results.poseLandmarks[8]; // Right ear
        const shoulder = results.poseLandmarks[12]; // Right shoulder
        const hip = results.poseLandmarks[24]; // Right hip
        const knee = results.poseLandmarks[26]; // Right knee

        if (ear && shoulder && hip && knee && ear.visibility! > 0.5 && shoulder.visibility! > 0.5 && hip.visibility! > 0.5 && knee.visibility! > 0.5) {
          const pEar: Point = { x: ear.x * videoWidth, y: ear.y * videoHeight };
          const pShoulder: Point = { x: shoulder.x * videoWidth, y: shoulder.y * videoHeight };
          const pHip: Point = { x: hip.x * videoWidth, y: hip.y * videoHeight };
          const pKnee: Point = { x: knee.x * videoWidth, y: knee.y * videoHeight };

          const hipAngle = calculateAngle(pShoulder, pHip, pKnee);
          const backAngle = calculateAngle(pEar, pShoulder, pHip);

          // Draw angles near joints
          canvasCtx.font = `900 ${Math.max(16, baseFontSize - 4)}px Arial`;
          canvasCtx.strokeStyle = '#000000';
          canvasCtx.lineWidth = strokeWidth;
          
          canvasCtx.strokeText(`Hip: ${Math.round(hipAngle)}°`, pHip.x + 20, pHip.y);
          canvasCtx.fillStyle = '#FFFFFF';
          canvasCtx.fillText(`Hip: ${Math.round(hipAngle)}°`, pHip.x + 20, pHip.y);
          
          canvasCtx.strokeText(`Back: ${Math.round(backAngle)}°`, pShoulder.x + 20, pShoulder.y);
          canvasCtx.fillStyle = '#FF9999';
          canvasCtx.fillText(`Back: ${Math.round(backAngle)}°`, pShoulder.x + 20, pShoulder.y);

          // Provide feedback
          if (backAngle < 145) {
            setFeedback('허리/등 굽음 주의! 가슴을 펴세요');
            setFeedbackColor('text-red-500');
          } else if (hipAngle > 160) {
            setFeedback('준비 자세');
            setFeedbackColor('text-blue-400');
          } else if (hipAngle < 100) {
            setFeedback('Perfect! 훌륭한 힙힌지입니다');
            setFeedbackColor('text-green-400');
          } else {
            setFeedback('엉덩이를 뒤로 더 빼세요');
            setFeedbackColor('text-yellow-400');
          }
        } else {
          setFeedback('전신(측면)이 화면에 보이게 해주세요');
          setFeedbackColor('text-white');
        }
      } else if (mode === 'turtle') {
        const isRightVisible = (results.poseLandmarks[8]?.visibility || 0) > (results.poseLandmarks[7]?.visibility || 0);
        const ear = isRightVisible ? results.poseLandmarks[8] : results.poseLandmarks[7];
        const shoulder = isRightVisible ? results.poseLandmarks[12] : results.poseLandmarks[11];
        
        if (ear && shoulder && ear.visibility! > 0.5 && shoulder.visibility! > 0.5) {
          const pEar: Point = { x: ear.x * videoWidth, y: ear.y * videoHeight };
          const pShoulder: Point = { x: shoulder.x * videoWidth, y: shoulder.y * videoHeight };
          
          // Calculate angle relative to vertical line
          const dx = Math.abs(pEar.x - pShoulder.x);
          const dy = Math.abs(pEar.y - pShoulder.y);
          const neckAngle = Math.atan2(dx, dy) * (180 / Math.PI);
          
          canvasCtx.beginPath();
          canvasCtx.moveTo(pEar.x, pEar.y);
          canvasCtx.lineTo(pShoulder.x, pShoulder.y);
          canvasCtx.strokeStyle = '#00FF00';
          canvasCtx.lineWidth = strokeWidth;
          canvasCtx.stroke();
          
          canvasCtx.beginPath();
          canvasCtx.moveTo(pShoulder.x, pShoulder.y);
          canvasCtx.lineTo(pShoulder.x, pShoulder.y - 150);
          canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          canvasCtx.setLineDash([5, 5]);
          canvasCtx.lineWidth = 2;
          canvasCtx.stroke();
          canvasCtx.setLineDash([]);
          
          canvasCtx.font = `900 ${baseFontSize}px Arial`;
          canvasCtx.fillStyle = '#FFFFFF';
          canvasCtx.fillText(`목 각도: ${Math.round(neckAngle)}°`, pEar.x + 20, pEar.y);
          
          if (neckAngle < 15) {
            setFeedback('정상 (바른 자세입니다)');
            setFeedbackColor('text-green-400');
          } else if (neckAngle < 25) {
            setFeedback('거북목 주의 (목이 앞으로 나왔습니다)');
            setFeedbackColor('text-yellow-400');
          } else {
            setFeedback('거북목 심각 (교정이 필요합니다!)');
            setFeedbackColor('text-red-500');
          }
        } else {
          setFeedback('측면이 화면에 보이게 서주세요');
          setFeedbackColor('text-white');
        }
      } else if (mode === 'asymmetry') {
        const leftShoulder = results.poseLandmarks[11];
        const rightShoulder = results.poseLandmarks[12];
        const leftHip = results.poseLandmarks[23];
        const rightHip = results.poseLandmarks[24];
        
        if (leftShoulder && rightShoulder && leftHip && rightHip && 
            leftShoulder.visibility! > 0.5 && rightShoulder.visibility! > 0.5 &&
            leftHip.visibility! > 0.5 && rightHip.visibility! > 0.5) {
            
          const ls: Point = { x: leftShoulder.x * videoWidth, y: leftShoulder.y * videoHeight };
          const rs: Point = { x: rightShoulder.x * videoWidth, y: rightShoulder.y * videoHeight };
          const lh: Point = { x: leftHip.x * videoWidth, y: leftHip.y * videoHeight };
          const rh: Point = { x: rightHip.x * videoWidth, y: rightHip.y * videoHeight };
          
          const shoulderDiff = ls.y - rs.y; // if > 0, left is lower -> right is higher
          const hipDiff = lh.y - rh.y;
          
          const shoulderAngle = Math.atan2(Math.abs(shoulderDiff), Math.abs(ls.x - rs.x)) * (180 / Math.PI);
          const hipAngle = Math.atan2(Math.abs(hipDiff), Math.abs(lh.x - rh.x)) * (180 / Math.PI);
          
          canvasCtx.lineWidth = strokeWidth;
          canvasCtx.strokeStyle = shoulderAngle > 3 ? '#FF0000' : '#00FF00';
          canvasCtx.beginPath();
          canvasCtx.moveTo(ls.x, ls.y);
          canvasCtx.lineTo(rs.x, rs.y);
          canvasCtx.stroke();
          
          canvasCtx.strokeStyle = hipAngle > 3 ? '#FF0000' : '#00FF00';
          canvasCtx.beginPath();
          canvasCtx.moveTo(lh.x, lh.y);
          canvasCtx.lineTo(rh.x, rh.y);
          canvasCtx.stroke();
          
          canvasCtx.font = `900 ${Math.max(16, baseFontSize - 4)}px Arial`;
          canvasCtx.fillStyle = '#FFFFFF';
          canvasCtx.fillText(`어깨 기울기: ${shoulderAngle.toFixed(1)}°`, rs.x - 40, rs.y - 20);
          canvasCtx.fillText(`골반 기울기: ${hipAngle.toFixed(1)}°`, rh.x - 40, rh.y - 20);
          
          if (shoulderAngle < 1.5 && hipAngle < 1.5) {
            setFeedback('좌우 대칭이 아주 좋습니다!');
            setFeedbackColor('text-green-400');
          } else {
            let fb = [];
            if (shoulderAngle >= 1.5) {
              fb.push(shoulderDiff > 0 ? `좌측 어깨가 ${shoulderAngle.toFixed(1)}° 더 높음` : `우측 어깨가 ${shoulderAngle.toFixed(1)}° 더 높음`);
            }
            if (hipAngle >= 1.5) {
              fb.push(hipDiff > 0 ? `좌측 골반이 ${hipAngle.toFixed(1)}° 더 높음` : `우측 골반이 ${hipAngle.toFixed(1)}° 더 높음`);
            }
            setFeedback(fb.join('\n'));
            setFeedbackColor('text-yellow-400');
          }
        } else {
          setFeedback('정면 전체가 화면에 보이게 서주세요');
          setFeedbackColor('text-white');
        }
      } else if (mode === 'plank') {
        const isRightVisible = (results.poseLandmarks[12]?.visibility || 0) > (results.poseLandmarks[11]?.visibility || 0);
        const shoulder = isRightVisible ? results.poseLandmarks[12] : results.poseLandmarks[11];
        const hip = isRightVisible ? results.poseLandmarks[24] : results.poseLandmarks[23];
        const ankle = isRightVisible ? results.poseLandmarks[28] : results.poseLandmarks[27];
        
        if (shoulder && hip && ankle && shoulder.visibility! > 0.5 && hip.visibility! > 0.5 && ankle.visibility! > 0.5) {
          const p1: Point = { x: shoulder.x * videoWidth, y: shoulder.y * videoHeight };
          const p2: Point = { x: hip.x * videoWidth, y: hip.y * videoHeight };
          const p3: Point = { x: ankle.x * videoWidth, y: ankle.y * videoHeight };
          
          const angle = calculateAngle(p1, p2, p3);
          
          canvasCtx.font = `900 ${baseFontSize}px Arial`;
          canvasCtx.strokeStyle = '#000000';
          canvasCtx.lineWidth = strokeWidth;
          canvasCtx.strokeText(`${Math.round(angle)}°`, p2.x, p2.y - 30);
          canvasCtx.fillStyle = '#FFFFFF';
          canvasCtx.fillText(`${Math.round(angle)}°`, p2.x, p2.y - 30);
          
          if (angle > 170) {
            setFeedback('Perfect! 훌륭한 코어 정렬입니다');
            setFeedbackColor('text-green-400');
          } else {
            setFeedback('엉덩이 높이를 조절하여 일직선을 만드세요');
            setFeedbackColor('text-yellow-400');
          }
        } else {
          setFeedback('전신(측면)이 화면에 보이게 해주세요');
          setFeedbackColor('text-white');
        }
      }
    }
    canvasCtx.restore();
  }, [mode, showGrid]);

  useEffect(() => {
    let isComponentMounted = true;
    let animationFrameId: number;
    let isProcessing = false;

    const pose = new Pose({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      selfieMode: true, // Acts like a mirror
    });

    pose.onResults((results: Results) => {
      if (isComponentMounted) {
        onResults(results);
      }
    });

    const processFrame = async () => {
      if (!isComponentMounted) return;

      const video = webcamRef.current?.video;
      // readyState >= 2 means HAVE_CURRENT_DATA
      if (video && video.readyState >= 2 && !isProcessing) {
        isProcessing = true;
        try {
          await pose.send({ image: video });
        } catch (error) {
          console.warn("Pose send error:", error);
        } finally {
          isProcessing = false;
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    processFrame();

    return () => {
      isComponentMounted = false;
      cancelAnimationFrame(animationFrameId);
      pose.close();
    };
  }, [onResults]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black">
      {/* Feedback Overlay */}
      <div className="absolute top-16 md:top-20 left-0 w-full flex justify-center z-20 pointer-events-none px-4">
        <div className="bg-black/70 px-5 py-3 md:px-8 md:py-4 rounded-3xl backdrop-blur-md border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.8)] max-w-full text-center">
          <h1 className={`text-xl md:text-3xl lg:text-4xl font-extrabold tracking-wide drop-shadow-md whitespace-pre-wrap ${feedbackColor}`}>
            {feedback}
          </h1>
        </div>
      </div>

      <Webcam
        key={facingMode}
        ref={webcamRef}
        mirrored={facingMode === 'user'}
        className="absolute w-full h-full object-cover z-0"
        videoConstraints={{
          facingMode: facingMode === 'environment' ? { exact: 'environment' } : 'user',
          width: facingMode === 'environment' ? { ideal: 3840 } : { ideal: 1920 },
          height: facingMode === 'environment' ? { ideal: 2160 } : { ideal: 1080 }
        }}
        onUserMediaError={(err) => console.error("Webcam access error:", err)}
      />
      <canvas
        ref={canvasRef}
        className="absolute w-full h-full object-cover z-10"
      />
    </div>
  );
});

export default PoseTracker;
