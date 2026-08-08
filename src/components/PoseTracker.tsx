import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import Webcam from 'react-webcam';
import type { Results } from '@mediapipe/pose';
import { calculateAngle, type Point } from '../utils/angleUtils';
import Pose3DViewer from './Pose3DViewer';

const Pose = (window as any).Pose;
const POSE_CONNECTIONS = (window as any).POSE_CONNECTIONS;
const drawConnectors = (window as any).drawConnectors;
const drawLandmarks = (window as any).drawLandmarks;

interface PoseTrackerProps {
  mode: 'squat' | 'deadlift' | 'turtle' | 'asymmetry' | 'plank';
  showGrid?: boolean;
  showUI?: boolean;
  facingMode?: 'user' | 'environment';
  imageSrc?: string | null;
  videoSrc?: string | null;
  isUploadMode?: boolean;
  viewMode?: '2d' | '3d';
  onBackgroundClick?: () => void;
}

export interface PoseTrackerRef {
  capture: (memberName: string, modeLabel?: string) => void;
  getScreenshot: () => string | null;
  getCleanScreenshot: () => string | null;
  startRecording: () => void;
  stopRecording: () => Promise<{ blob: Blob | null, frames: string[] }>;
}

const PoseTracker = forwardRef<PoseTrackerRef, PoseTrackerProps>(({ mode, showGrid = false, showUI = true, facingMode = 'environment', imageSrc = null, videoSrc = null, isUploadMode = false, viewMode = '2d', onBackgroundClick }, ref) => {
  const webcamRef = useRef<Webcam>(null);
  const uploadedVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [feedbackColor, setFeedbackColor] = useState<string>('text-white');
  const [worldLandmarks, setWorldLandmarks] = useState<any>(null);
  const [poseLandmarksData, setPoseLandmarksData] = useState<{landmarks: any, width: number, height: number} | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const lastImageRef = useRef<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>(null);
  const lastResultsRef = useRef<Results | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const frameIntervalRef = useRef<number | null>(null);
  const capturedFramesRef = useRef<string[]>([]);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingAnimFrameRef = useRef<number | null>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const touchStartZoom = useRef<number>(1);
  const initialPinchDistance = useRef<number | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerDownPos.current) {
      const dx = Math.abs(e.clientX - pointerDownPos.current.x);
      const dy = Math.abs(e.clientY - pointerDownPos.current.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Only toggle UI if pointer movement is less than 5px (tap/click, not drag/rotate)
      if (dist < 5 && onBackgroundClick) {
        onBackgroundClick();
      }
    }
    pointerDownPos.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance.current = Math.sqrt(dx * dx + dy * dy);
      touchStartZoom.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const distanceRatio = currentDistance / initialPinchDistance.current;
      let newZoom = touchStartZoom.current * distanceRatio;
      setZoom(Math.max(1, Math.min(3, newZoom)));
    }
  };

  const handleTouchEnd = () => {
    initialPinchDistance.current = null;
  };

  useImperativeHandle(ref, () => {
    const createCompositeImage = (mimeType = 'image/png', quality = 1.0) => {
      if (!canvasRef.current || !lastImageRef.current) return null;
      
      const img = lastImageRef.current;
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;
      
      // Unconditionally crop to 9:16 portrait ratio
      let outH = height;
      let outW = Math.round(height * 9 / 16);
      let srcX = Math.round((width - outW) / 2);
      let srcY = 0;
      let srcW = outW;
      let srcH = height;

      if (width < outW) {
        outW = width;
        outH = Math.round(width * 16 / 9);
        srcX = 0;
        srcY = Math.round((height - outH) / 2);
        srcW = width;
        srcH = outH;
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = outW;
      tempCanvas.height = outH;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return null;
      
      // Fill with background color first
      ctx.fillStyle = '#111827'; // gray-900 to match 3D viewer background
      ctx.fillRect(0, 0, outW, outH);
      
      if (viewMode === '2d') {
        // Draw the original camera/photo image first (cropped if landscape)
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
        
        // Draw the 2D canvas on top (skeleton overlay, cropped same way)
        ctx.drawImage(canvasRef.current, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
      } else {
        // In 3D mode, skip original photo. Draw grid (from 2D canvas) and 3D canvas.
        ctx.drawImage(canvasRef.current, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
        
        const threeCanvas = document.querySelector('.pose-3d-canvas canvas') as HTMLCanvasElement;
        if (threeCanvas) {
          ctx.drawImage(threeCanvas, 0, 0, outW, outH);
        }
      }
      
      return tempCanvas.toDataURL(mimeType, quality);
    };


    return {
      capture: (memberName: string, modeLabel?: string) => {
        const dataUrl = createCompositeImage('image/png');
        if (!dataUrl) return;
        
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
        const modeStr = modeLabel ? `-${modeLabel}` : '';
        link.download = `${name}${modeStr}-캡처-${dateStr}-${timeStr}.png`;
        link.href = dataUrl;
        link.click();
      },
      getScreenshot: () => {
        return createCompositeImage('image/jpeg', 0.8);
      },
      getCleanScreenshot: () => {
        if (!lastImageRef.current) return null;
        const img = lastImageRef.current;
        const rawW = (img as any).videoWidth || (img as any).naturalWidth || img.width;
        const rawH = (img as any).videoHeight || (img as any).naturalHeight || img.height;
        if (!rawW || !rawH) return null;

        // Unconditionally crop to 9:16 portrait ratio
        let outH = rawH;
        let outW = Math.round(rawH * 9 / 16);
        let srcX = Math.round((rawW - outW) / 2);
        let srcY = 0;
        let srcW = outW;
        let srcH = rawH;

        if (rawW < outW) {
          outW = rawW;
          outH = Math.round(rawW * 16 / 9);
          srcX = 0;
          srcY = Math.round((rawH - outH) / 2);
          srcW = rawW;
          srcH = outH;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = outW;
        tempCanvas.height = outH;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img as any, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
        return tempCanvas.toDataURL('image/jpeg', 0.9);
      },
      startRecording: () => {
        if (!canvasRef.current) return;
        recordedChunksRef.current = [];
        capturedFramesRef.current = [];
        try {
          const rawW = canvasRef.current.width || 1280;
          const rawH = canvasRef.current.height || 720;
          
          let outW = rawW;
          let outH = rawH;
          let srcX = 0, srcY = 0, srcW = rawW, srcH = rawH;

          // Always enforce 9:16 portrait ratio for video recording (center cropped like UI object-cover)
          if (rawW > rawH) {
            outH = rawH;
            outW = Math.round(rawH * 9 / 16);
            srcX = Math.round((rawW - outW) / 2);
            srcY = 0;
            srcW = outW;
            srcH = rawH;
          } else {
            const targetW = Math.round(rawH * 9 / 16);
            if (rawW > targetW) {
              outH = rawH;
              outW = targetW;
              srcX = Math.round((rawW - outW) / 2);
              srcY = 0;
              srcW = outW;
              srcH = rawH;
            }
          }

          // Ensure width and height are even numbers for codec compatibility
          if (outW % 2 !== 0) outW -= 1;
          if (outH % 2 !== 0) outH -= 1;

          const recCanvas = document.createElement('canvas');
          recCanvas.width = outW;
          recCanvas.height = outH;
          recordingCanvasRef.current = recCanvas;

          const renderRecordingFrame = () => {
            if (recordingCanvasRef.current) {
              const recCtx = recordingCanvasRef.current.getContext('2d');
              if (recCtx) {
                recCtx.save();
                recCtx.fillStyle = '#111827';
                recCtx.fillRect(0, 0, outW, outH);

                if (viewMode === '2d') {
                  if (canvasRef.current) {
                    recCtx.drawImage(canvasRef.current, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
                  }
                } else {
                  if (canvasRef.current) {
                    recCtx.drawImage(canvasRef.current, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
                  }
                  const threeCanvas = document.querySelector('.pose-3d-canvas canvas') as HTMLCanvasElement;
                  if (threeCanvas && threeCanvas.width > 0 && threeCanvas.height > 0) {
                    try {
                      recCtx.drawImage(threeCanvas, 0, 0, outW, outH);
                    } catch (e) {}
                  }
                }
                recCtx.restore();
              }
              recordingAnimFrameRef.current = requestAnimationFrame(renderRecordingFrame);
            }
          };
          renderRecordingFrame();

          const stream = recCanvas.captureStream(30);
          
          // 캠에서 오디오 트랙을 가져와서 캔버스 스트림에 합침
          const webcamStream = (webcamRef.current?.stream || webcamRef.current?.video?.srcObject) as MediaStream | null;
          if (webcamStream) {
            const audioTracks = webcamStream.getAudioTracks();
            if (audioTracks.length > 0) {
              audioTracks.forEach(track => {
                track.enabled = true;
                stream.addTrack(track);
              });
            }
          }

          // 업로드된 동영상인 경우 동영상 요소에서 오디오 트랙 추출 및 합침
          if (uploadedVideoRef.current) {
            const videoEl = uploadedVideoRef.current as any;
            try {
              let videoStream: MediaStream | null = null;
              if (typeof videoEl.captureStream === 'function') {
                videoStream = videoEl.captureStream();
              } else if (typeof videoEl.mozCaptureStream === 'function') {
                videoStream = videoEl.mozCaptureStream();
              }
              if (videoStream) {
                const videoAudioTracks = videoStream.getAudioTracks();
                videoAudioTracks.forEach(track => {
                  track.enabled = true;
                  stream.addTrack(track);
                });
              }
            } catch (err) {
              console.warn("Uploaded video audio capture failed:", err);
            }
          }
          
          let options: MediaRecorderOptions = {};
          const candidateTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/mp4'
          ];

          for (const type of candidateTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              options = { mimeType: type };
              break;
            }
          }

          const mediaRecorder = new MediaRecorder(stream, options);
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          mediaRecorder.start(100);
          mediaRecorderRef.current = mediaRecorder;
          
          frameIntervalRef.current = window.setInterval(() => {
            const dataUrl = createCompositeImage('image/jpeg', 0.4);
            if (dataUrl) {
              capturedFramesRef.current.push(dataUrl);
              // 메모리 최적화: 프레임이 30개를 초과하면 절반(홀수 인덱스)을 버려서 간격을 동적으로 늘림
              if (capturedFramesRef.current.length > 30) {
                capturedFramesRef.current = capturedFramesRef.current.filter((_, i) => i === 0 || i === capturedFramesRef.current.length - 1 || i % 2 === 0);
              }
            }
          }, 500) as unknown as number;
        } catch (e) {
          console.error("Recording start failed:", e);
        }
      },
      stopRecording: () => {
        return new Promise((resolve) => {
          if (recordingAnimFrameRef.current !== null) {
            cancelAnimationFrame(recordingAnimFrameRef.current);
            recordingAnimFrameRef.current = null;
          }
          recordingCanvasRef.current = null;

          if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
            resolve({ blob: null, frames: [] });
            return;
          }
          
          if (frameIntervalRef.current !== null) {
            clearInterval(frameIntervalRef.current);
            frameIntervalRef.current = null;
          }

          mediaRecorderRef.current.onstop = () => {
            const mimeType = mediaRecorderRef.current?.mimeType || 'video/webm';
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            
            const frames = capturedFramesRef.current;
            const keyFrames: string[] = [];
            if (frames.length > 0) {
              const numFrames = Math.min(3, frames.length);
              if (numFrames === 1) {
                keyFrames.push(frames[0]);
              } else {
                for (let i = 0; i < numFrames; i++) {
                  const idx = Math.floor(i * (frames.length - 1) / (numFrames - 1));
                  keyFrames.push(frames[idx]);
                }
              }
            } else {
               const current = createCompositeImage('image/jpeg', 0.4);
               if (current) keyFrames.push(current);
            }
            
            resolve({ blob, frames: keyFrames });
          };
          
          mediaRecorderRef.current.stop();
        });
      }
    };
  });

  const onResults = useCallback((results: Results) => {
    if (!canvasRef.current) return;
    
    lastImageRef.current = results.image as any;
    lastResultsRef.current = results;

    const videoWidth = (results.image as any).videoWidth || (results.image as any).naturalWidth || results.image.width;
    const videoHeight = (results.image as any).videoHeight || (results.image as any).naturalHeight || results.image.height;

    // Save 3D landmarks for 3D viewer
    if (results.poseWorldLandmarks) {
      setWorldLandmarks(results.poseWorldLandmarks);
      setPoseLandmarksData({ landmarks: results.poseLandmarks, width: videoWidth, height: videoHeight });
    } else {
      setWorldLandmarks(null);
      setPoseLandmarksData(null);
    }

    if (canvasRef.current.width !== videoWidth) {
      canvasRef.current.width = videoWidth;
    }
    if (canvasRef.current.height !== videoHeight) {
      canvasRef.current.height = videoHeight;
    }

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Draw the original video/image frame ONLY when analyzing uploaded static images or uploaded videos (NOT live webcam)
    if (viewMode === '2d' && (imageSrc || videoSrc || isUploadMode)) {
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    
    // Draw Posture Grid
    if (showGrid) {
      canvasCtx.save();
      canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; // Slightly more visible white
      canvasCtx.shadowColor = 'rgba(0, 0, 0, 0.6)'; // Add dark shadow for visibility on light backgrounds
      canvasCtx.shadowBlur = 4;
      
      // 화면의 실제 크기(해상도)에 맞춰 그리드 간격과 굵기 동적 계산
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRect.width > 0 ? videoWidth / canvasRect.width : 1;
      const scaleY = canvasRect.height > 0 ? videoHeight / canvasRect.height : 1;
      
      // 화면 기준 간격 (화면이 커지면 간격도 넓어짐, 최소 50px 보장)
      const visualSpacingX = Math.max(50, canvasRect.width / 8); 
      const visualSpacingY = Math.max(50, canvasRect.height / 6);
      
      const colWidth = visualSpacingX * scaleX;
      const rowHeight = visualSpacingY * scaleY;
      
      // 화면 기준 선 굵기 (화면 크기에 관계없이 항상 일정한 두께 유지, 또는 화면이 커지면 살짝 두꺼워지게)
      // 화면 너비의 0.2% 두께, 최소 1px, 최대 4px
      const visualLineWidth = Math.max(1, Math.min(4, canvasRect.width * 0.002));
      const gridLineWidth = visualLineWidth * scaleX;
      canvasCtx.lineWidth = gridLineWidth;

      // Draw vertical lines symmetrically from center
      const centerX = videoWidth / 2;
      const colsHalf = Math.floor(centerX / colWidth);
      for (let i = 1; i <= colsHalf; i++) {
        // Right side
        canvasCtx.beginPath();
        canvasCtx.moveTo(centerX + i * colWidth, 0);
        canvasCtx.lineTo(centerX + i * colWidth, videoHeight);
        canvasCtx.stroke();
        // Left side
        canvasCtx.beginPath();
        canvasCtx.moveTo(centerX - i * colWidth, 0);
        canvasCtx.lineTo(centerX - i * colWidth, videoHeight);
        canvasCtx.stroke();
      }

      // Draw horizontal lines symmetrically from center
      const centerY = videoHeight / 2;
      const rowsHalf = Math.floor(centerY / rowHeight);
      for (let i = 1; i <= rowsHalf; i++) {
        // Bottom side
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, centerY + i * rowHeight);
        canvasCtx.lineTo(videoWidth, centerY + i * rowHeight);
        canvasCtx.stroke();
        // Top side
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, centerY - i * rowHeight);
        canvasCtx.lineTo(videoWidth, centerY - i * rowHeight);
        canvasCtx.stroke();
      }

      // Draw strong center vertical line for symmetry check
      canvasCtx.strokeStyle = 'rgba(0, 255, 255, 0.6)'; // Cyan
      canvasCtx.lineWidth = gridLineWidth * 1.5;
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
    
    // Draw 2D skeleton only in 2D mode
    if (viewMode === '2d' && results.poseLandmarks) {
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
      const lineThickness = Math.max(6, Math.floor(videoWidth / 160));
      const dotRadius = Math.max(6, Math.floor(videoWidth / 160));

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
        const isRightVisible = (results.poseLandmarks[26]?.visibility || 0) >= (results.poseLandmarks[25]?.visibility || 0);
        const hip = isRightVisible ? results.poseLandmarks[24] : results.poseLandmarks[23];
        const knee = isRightVisible ? results.poseLandmarks[26] : results.poseLandmarks[25];
        const ankle = isRightVisible ? results.poseLandmarks[28] : results.poseLandmarks[27];

        if (hip && knee && ankle && (hip.visibility ?? 0) > 0.3 && (knee.visibility ?? 0) > 0.3 && (ankle.visibility ?? 0) > 0.3) {
          const p1: Point = { x: hip.x * videoWidth, y: hip.y * videoHeight };
          const p2: Point = { x: knee.x * videoWidth, y: knee.y * videoHeight };
          const p3: Point = { x: ankle.x * videoWidth, y: ankle.y * videoHeight };
          const angle = calculateAngle(p1, p2, p3);

          // Draw angle text near knee
          canvasCtx.font = `900 ${baseFontSize}px "NanumGothic-ExtraBold", sans-serif`;
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
        const isRightVisible = (results.poseLandmarks[26]?.visibility || 0) >= (results.poseLandmarks[25]?.visibility || 0);
        const ear = isRightVisible ? results.poseLandmarks[8] : results.poseLandmarks[7];
        const shoulder = isRightVisible ? results.poseLandmarks[12] : results.poseLandmarks[11];
        const hip = isRightVisible ? results.poseLandmarks[24] : results.poseLandmarks[23];
        const knee = isRightVisible ? results.poseLandmarks[26] : results.poseLandmarks[25];

        if (ear && shoulder && hip && knee && (ear.visibility ?? 0) > 0.3 && (shoulder.visibility ?? 0) > 0.3 && (hip.visibility ?? 0) > 0.3 && (knee.visibility ?? 0) > 0.3) {
          const pEar: Point = { x: ear.x * videoWidth, y: ear.y * videoHeight };
          const pShoulder: Point = { x: shoulder.x * videoWidth, y: shoulder.y * videoHeight };
          const pHip: Point = { x: hip.x * videoWidth, y: hip.y * videoHeight };
          const pKnee: Point = { x: knee.x * videoWidth, y: knee.y * videoHeight };

          const hipAngle = calculateAngle(pShoulder, pHip, pKnee);
          const backAngle = calculateAngle(pEar, pShoulder, pHip);

          // Draw angles near joints
          canvasCtx.font = `900 ${Math.max(16, baseFontSize - 4)}px "NanumGothic-ExtraBold", sans-serif`;
          canvasCtx.strokeStyle = '#000000';
          canvasCtx.lineWidth = strokeWidth;
          
          canvasCtx.strokeText(`고관절: ${Math.round(hipAngle)}°`, pHip.x + 20, pHip.y);
          canvasCtx.fillStyle = '#FFFFFF';
          canvasCtx.fillText(`고관절: ${Math.round(hipAngle)}°`, pHip.x + 20, pHip.y);
          
          canvasCtx.strokeText(`허리/등: ${Math.round(backAngle)}°`, pShoulder.x + 20, pShoulder.y);
          canvasCtx.fillStyle = '#FF9999';
          canvasCtx.fillText(`허리/등: ${Math.round(backAngle)}°`, pShoulder.x + 20, pShoulder.y);

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
        const isRightVisible = (results.poseLandmarks[8]?.visibility || 0) >= (results.poseLandmarks[7]?.visibility || 0);
        const ear = isRightVisible ? results.poseLandmarks[8] : results.poseLandmarks[7];
        const shoulder = isRightVisible ? results.poseLandmarks[12] : results.poseLandmarks[11];
        
        if (ear && shoulder && (ear.visibility ?? 0) > 0.3 && (shoulder.visibility ?? 0) > 0.3) {
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
          
          canvasCtx.font = `900 ${baseFontSize}px "NanumGothic-ExtraBold", sans-serif`;
          canvasCtx.strokeStyle = '#000000';
          canvasCtx.lineWidth = strokeWidth;
          canvasCtx.strokeText(`목 각도: ${Math.round(neckAngle)}°`, pEar.x + 20, pEar.y);
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
            (leftShoulder.visibility ?? 0) > 0.3 && (rightShoulder.visibility ?? 0) > 0.3 &&
            (leftHip.visibility ?? 0) > 0.3 && (rightHip.visibility ?? 0) > 0.3) {
            
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
          
          canvasCtx.font = `900 ${Math.max(16, baseFontSize - 4)}px "NanumGothic-ExtraBold", sans-serif`;
          canvasCtx.strokeStyle = '#000000';
          canvasCtx.lineWidth = strokeWidth;
          canvasCtx.strokeText(`어깨 기울기: ${shoulderAngle.toFixed(1)}°`, rs.x - 40, rs.y - 20);
          canvasCtx.strokeText(`골반 기울기: ${hipAngle.toFixed(1)}°`, rh.x - 40, rh.y - 20);
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
        const isRightVisible = (results.poseLandmarks[12]?.visibility || 0) >= (results.poseLandmarks[11]?.visibility || 0);
        const shoulder = isRightVisible ? results.poseLandmarks[12] : results.poseLandmarks[11];
        const hip = isRightVisible ? results.poseLandmarks[24] : results.poseLandmarks[23];
        const ankle = isRightVisible ? results.poseLandmarks[28] : results.poseLandmarks[27];
        
        if (shoulder && hip && ankle && (shoulder.visibility ?? 0) > 0.3 && (hip.visibility ?? 0) > 0.3 && (ankle.visibility ?? 0) > 0.3) {
          const p1: Point = { x: shoulder.x * videoWidth, y: shoulder.y * videoHeight };
          const p2: Point = { x: hip.x * videoWidth, y: hip.y * videoHeight };
          const p3: Point = { x: ankle.x * videoWidth, y: ankle.y * videoHeight };
          
          const angle = calculateAngle(p1, p2, p3);
          
          canvasCtx.font = `900 ${baseFontSize}px "NanumGothic-ExtraBold", sans-serif`;
          canvasCtx.strokeStyle = '#000000';
          canvasCtx.lineWidth = strokeWidth;
          canvasCtx.strokeText(`코어정렬: ${Math.round(angle)}°`, p2.x, p2.y - 30);
          canvasCtx.fillStyle = '#FFFFFF';
          canvasCtx.fillText(`코어정렬: ${Math.round(angle)}°`, p2.x, p2.y - 30);
          
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
    } else {
      if (feedback !== '') {
        setFeedback('');
      }
    }
    canvasCtx.restore();
  }, [mode, showGrid, viewMode]);

  // Continuously sync Three.js 3D canvas to 2D canvas in 3D mode so media recording captures the 3D skeleton
  useEffect(() => {
    if (viewMode !== '3d') return;
    let animId: number;
    const update3DOverlay = () => {
      if (canvasRef.current) {
        const threeCanvas = document.querySelector('.pose-3d-canvas canvas') as HTMLCanvasElement;
        if (threeCanvas && threeCanvas.width > 0 && threeCanvas.height > 0) {
          const canvasCtx = canvasRef.current.getContext('2d');
          if (canvasCtx) {
            canvasCtx.save();
            canvasCtx.fillStyle = '#111827';
            canvasCtx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            canvasCtx.drawImage(threeCanvas, 0, 0, canvasRef.current.width, canvasRef.current.height);
            canvasCtx.restore();
          }
        }
      }
      animId = requestAnimationFrame(update3DOverlay);
    };
    return () => cancelAnimationFrame(animId);
  }, [viewMode]);

  const onResultsRef = useRef(onResults);
  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  // Re-render static image canvas overlays when viewMode, mode, or grid changes
  useEffect(() => {
    if (imageSrc && lastResultsRef.current) {
      onResults(lastResultsRef.current);
    }
  }, [viewMode, mode, showGrid, imageSrc, onResults]);

  // Clear canvas & previous frame references immediately when sources or modes change
  useEffect(() => {
    if (canvasRef.current) {
      const canvasCtx = canvasRef.current.getContext('2d');
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    lastImageRef.current = null;
    lastResultsRef.current = null;
  }, [imageSrc, videoSrc, isUploadMode, facingMode]);

  useEffect(() => {
    let isComponentMounted = true;
    let animationFrameId: number;
    let isProcessing = false;
    let lastProcessingStartTime = 0;
    let lastSendTime = 0;
    let lastSuccessFrameTime = Date.now();

    if (!processingCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      processingCanvasRef.current = canvas;
    }
    const procCanvas = processingCanvasRef.current;

    const pose = new Pose({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
    });

    pose.setOptions({
      modelComplexity: 0, // Lite mode (3x faster, optimized for mobile browsers to prevent overheating & camera stalls)
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      selfieMode: false, // Keep false to avoid WebGL double-mirroring shader conflicts on front camera
    });

    pose.onResults((results: Results) => {
      if (isComponentMounted) {
        lastSuccessFrameTime = Date.now();
        onResultsRef.current(results);
      }
    });

    let processFrameFunc: (() => void) | null = null;

    // Autonomous Watchdog Monitor to automatically unfreeze hung camera pipelines
    const watchdogTimer = setInterval(() => {
      if (!isComponentMounted || isUploadMode || imageSrc || videoSrc) return;
      const now = Date.now();
      const timeSinceLastFrame = now - lastSuccessFrameTime;

      // If no pose frame was successfully processed for more than 1200ms while webcam is active
      if (timeSinceLastFrame > 1200) {
        console.warn(`[Watchdog] Camera/Pose freeze detected (${timeSinceLastFrame}ms). Triggering automatic recovery...`);
        isProcessing = false; // Release any hung lock

        const video = webcamRef.current?.video;
        if (video) {
          if (video.paused && !document.hidden) {
            video.play().catch(e => console.warn("[Watchdog] Video play retry error:", e));
          }
        }

        // Restart requestAnimationFrame loop if stalled
        cancelAnimationFrame(animationFrameId);
        if (processFrameFunc) {
          animationFrameId = requestAnimationFrame(processFrameFunc);
        }

        lastSuccessFrameTime = now;
      }
    }, 500);

    const handleVisibilityChange = () => {
      isProcessing = false;
      lastSuccessFrameTime = Date.now();
      if (document.visibilityState === 'visible') {
        const video = webcamRef.current?.video;
        if (video && video.paused) {
          video.play().catch(e => console.warn("Video play error:", e));
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (imageSrc) {
      const img = new Image();
      img.onload = async () => {
        if (!isComponentMounted) return;
        try {
          lastImageRef.current = img;
          await pose.send({ image: img });
        } catch (error) {
          console.warn("Pose send error for image:", error);
        }
      };
      img.src = imageSrc;
    } else if (videoSrc) {
      const processVideoFrame = async () => {
        if (!isComponentMounted) return;
        animationFrameId = requestAnimationFrame(processVideoFrame);

        const now = Date.now();
        // Stuck processing lock timeout recovery (800ms)
        if (isProcessing && now - lastProcessingStartTime > 800) {
          isProcessing = false;
        }

        const video = uploadedVideoRef.current;
        if (video && video.readyState >= 2 && !isProcessing) {
          if (now - lastSendTime < 33) return; // ~30 FPS limit

          isProcessing = true;
          lastProcessingStartTime = now;
          lastSendTime = now;
          lastImageRef.current = video;
          try {
            if (procCanvas) {
              const vw = video.videoWidth || 1280;
              const vh = video.videoHeight || 720;
              const targetW = 1280;
              const targetH = Math.round((vh / vw) * 1280);
              if (procCanvas.width !== targetW || procCanvas.height !== targetH) {
                procCanvas.width = targetW;
                procCanvas.height = targetH;
              }
              const pctx = procCanvas.getContext('2d');
              if (pctx) {
                pctx.drawImage(video, 0, 0, targetW, targetH);
                await pose.send({ image: procCanvas });
              } else {
                await pose.send({ image: video });
              }
            } else {
              await pose.send({ image: video });
            }
          } catch (error) {
            console.warn("Pose send error for uploaded video:", error);
          } finally {
            isProcessing = false;
          }
        }
      };
      processVideoFrame();
    } else if (!isUploadMode) {
      const processFrame = async () => {
        if (!isComponentMounted) return;
        
        animationFrameId = requestAnimationFrame(processFrame);

        const now = Date.now();
        // Stuck processing lock timeout recovery (800ms)
        if (isProcessing && now - lastProcessingStartTime > 800) {
          isProcessing = false;
        }

        const video = webcamRef.current?.video;
        if (video) {
          if (video.paused && !document.hidden) {
            video.play().catch(() => {});
          }

          // Throttle FPS to ~30 FPS to prevent WebGL GPU stalls during rapid camera movement
          if (now - lastSendTime < 33) return;

          if (video.readyState >= 2 && !isProcessing) {
            isProcessing = true;
            lastProcessingStartTime = now;
            lastSendTime = now;
            lastImageRef.current = video;
            try {
              if (procCanvas) {
                const vw = video.videoWidth || 1280;
                const vh = video.videoHeight || 720;
                const targetW = 1280;
                const targetH = Math.round((vh / vw) * 1280);
                if (procCanvas.width !== targetW || procCanvas.height !== targetH) {
                  procCanvas.width = targetW;
                  procCanvas.height = targetH;
                }
                const pctx = procCanvas.getContext('2d');
                if (pctx) {
                  pctx.drawImage(video, 0, 0, targetW, targetH);
                  await pose.send({ image: procCanvas });
                } else {
                  await pose.send({ image: video });
                }
              } else {
                await pose.send({ image: video });
              }
            } catch (error) {
              console.warn("Pose send error:", error);
            } finally {
              isProcessing = false;
            }
          }
        }
      };
      processFrameFunc = processFrame;
      processFrame();
    } else {
      setFeedback('');
    }

    return () => {
      isComponentMounted = false;
      clearInterval(watchdogTimer);
      cancelAnimationFrame(animationFrameId);
      isProcessing = false;
      try {
        pose.close().catch(() => {});
      } catch (e) {}
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [facingMode, imageSrc, videoSrc, isUploadMode]);

  return (
    <div 
      className="relative w-full h-full flex flex-col items-center justify-center bg-black touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Feedback Overlay - Attached directly below Mode Selection Bar */}
      {feedback && (
        <div className={`absolute top-28 sm:top-32 left-0 w-full flex justify-center z-30 pointer-events-none px-3 transition-all duration-300 ${showUI ? 'opacity-100' : 'opacity-0'}`}>
          <div className="bg-black/75 px-4 py-2 sm:px-6 sm:py-2.5 rounded-full backdrop-blur-md border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.7)] max-w-[92%] sm:max-w-md text-center flex items-center justify-center">
            <h1 className={`text-xs sm:text-sm md:text-base font-extrabold tracking-wide drop-shadow-md whitespace-pre-wrap ${feedbackColor}`}>
              {feedback}
            </h1>
          </div>
        </div>
      )}


      <div 
        className="absolute inset-0 flex items-center justify-center origin-center transition-transform duration-100 ease-out pointer-events-none"
        style={{ transform: `scale(${zoom})` }}
      >
        {!imageSrc && !videoSrc && !isUploadMode && (
        <Webcam
          audio={true}
          audioConstraints={{
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }}
          muted={true}
          key={facingMode}
          ref={webcamRef}
          mirrored={facingMode === 'user'}
          className={`absolute w-full h-full object-cover z-0 ${viewMode === '3d' ? 'opacity-0' : 'opacity-100'}`}
          videoConstraints={{
            facingMode: 'environment',
            width: { ideal: 3840, min: 1920 },
            height: { ideal: 2160, min: 1080 },
            frameRate: { ideal: 30, max: 30 },
            // @ts-ignore
            advanced: [{ zoom: 0.6 }]
          }}
          onUserMedia={(stream) => {
            const track = stream.getVideoTracks()[0];
            if (track && track.getCapabilities && track.applyConstraints) {
              const caps = track.getCapabilities() as any;
              if (caps.zoom) {
                // Use 0.6x zoom (ultra-wide) for rear camera
                const targetZoom = Math.max(caps.zoom.min ?? 0.6, 0.1);
                const finalZoom = Math.min(targetZoom, 0.6);
                const safeZoom = finalZoom < (caps.zoom.min ?? 0) ? (caps.zoom.min ?? 1) : finalZoom;
                track.applyConstraints({ advanced: [{ zoom: safeZoom } as any] }).catch(console.warn);
              }
            }
          }}
          onUserMediaError={(err) => console.error("Webcam access error:", err)}
        />
      )}

      {imageSrc && (
        <img
          src={imageSrc}
          alt="Upload"
          className={`absolute w-full h-full object-contain z-0 ${viewMode === '3d' ? 'opacity-0' : 'opacity-100'}`}
        />
      )}

      {videoSrc && (
        <video
          ref={uploadedVideoRef}
          src={videoSrc}
          autoPlay
          loop
          muted={false}
          playsInline
          controls
          onLoadedData={(e) => {
            (e.target as HTMLVideoElement).play().catch(err => console.warn("Video play error:", err));
          }}
          className={`absolute w-full h-full object-contain z-0 ${viewMode === '3d' ? 'opacity-0' : 'opacity-100'}`}
        />
      )}
      
      {viewMode === '3d' && (
        <div className="absolute inset-0 z-10 bg-gray-900 pointer-events-auto">
          <Pose3DViewer worldLandmarks={worldLandmarks} poseLandmarksData={poseLandmarksData} onBackgroundClick={onBackgroundClick} mode={mode} />
          {!worldLandmarks && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-lg">
              3D 좌표를 추출 중입니다...
            </div>
          )}
        </div>
      )}

      <canvas
        ref={canvasRef}
        className={`absolute w-full h-full z-20 pointer-events-none ${imageSrc || videoSrc ? 'object-contain' : 'object-cover'} ${facingMode === 'user' && !imageSrc && !videoSrc ? '-scale-x-100' : ''} ${viewMode === '2d' && (imageSrc || videoSrc) ? 'bg-black' : ''}`}
      />
      </div>
    </div>
  );
});

export default PoseTracker;
