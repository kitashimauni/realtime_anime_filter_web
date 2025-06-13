import { useEffect, useRef, useState } from 'react';

type VideoDevice = MediaDeviceInfo;

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 });
  const [displaySize, setDisplaySize] = useState({ width: 640, height: 480 });

  useEffect(() => {
    console.log('OpenCV初期化開始');
    
    // OpenCVの初期化を待つ関数
    const waitForOpenCV = () => {
      if ((window as any).cv && (window as any).cv.Mat && (window as any).cv.imread) {
        console.log('OpenCV.js は準備完了しました！');
        setCvReady(true);
      } else {
        console.log('OpenCVを待機中...');
        setTimeout(waitForOpenCV, 100);
      }
    };
    
    waitForOpenCV();
  }, []);


  // 初期化（カメラ許可 & デバイス取得）
  useEffect(() => {
    const init = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          console.log("enumerateDevices() not supported.");
        } else {
          // カメラとマイクを列挙
          const deviceInfos = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = deviceInfos.filter((d) => d.kind === 'videoinput');
          console.log('videoDevices', videoDevices);
          setDevices(videoDevices);
  
          if (videoDevices.length > 0) {
            setSelectedDeviceId(videoDevices[0].deviceId);
          }
        }
      } catch (error) {
        console.error('Error accessing media devices.', error);
      }
    };
    init();
  }, []);

  // カメラ切替処理
  useEffect(() => {
    const startStream = async () => {
      if (!selectedDeviceId) return;

      // 既存のストリームを停止
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      try {
        const constraints = {
          video: { 
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          
          // videoの読み込み完了イベントを待ち受ける
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              const width = videoRef.current.videoWidth;
              const height = videoRef.current.videoHeight;
              
              // 内部解像度とキャンバスサイズを設定
              setVideoSize({ width, height });
              
              // 表示サイズを設定（画面サイズに合わせて縮小）
              const maxWidth = Math.min(width, window.innerWidth * 0.9);
              const scale = maxWidth / width;
              setDisplaySize({
                width: Math.floor(width * scale),
                height: Math.floor(height * scale)
              });
              
              console.log(`ビデオ実解像度: ${width}x${height}, 表示サイズ: ${maxWidth}x${Math.floor(height * scale)}`);
              
              // canvasのサイズを設定
              if (canvasRef.current) {
                canvasRef.current.width = width;
                canvasRef.current.height = height;
              }
            }
          };
        }

        setStream(newStream);
      } catch (error) {
        console.error('カメラの起動に失敗しました:', error);
      }
    };

    startStream();
  }, [selectedDeviceId]);

  // フィルター処理
  useEffect(() => {
    console.log('フィルター処理useEffect開始', { cvReady, stream: !!stream });
    
    if (!cvReady) {
      console.log('OpenCVが準備できていません');
      return;
    }
    
    if (!stream) {
      console.log('ストリームが準備できていません');
      return;
    }
    
    console.log('フィルター処理を開始します');
    
    let requestId: number;
    let frameCount = 0;

    const draw = () => {
      if (!videoRef.current || !canvasRef.current) {
        requestId = requestAnimationFrame(draw);
        return;
      }

      if (videoRef.current.readyState < 2) {
        requestId = requestAnimationFrame(draw);
        return;
      }

      frameCount++;
      if (frameCount === 1) {
        console.log('最初のフレーム処理を開始');
      }
      if (frameCount % 30 === 0) {
        console.log(`フィルター処理実行中 - フレーム ${frameCount}`);
      }
      
      try {
        const width = videoRef.current.videoWidth;
        const height = videoRef.current.videoHeight;
        
        if (width === 0 || height === 0) {
          requestId = requestAnimationFrame(draw);
          return;
        }
        
        // キャンバスの内部サイズが異なる場合は更新
        if (canvasRef.current.width !== width || canvasRef.current.height !== height) {
          console.log(`キャンバスサイズを更新: ${width}x${height}`);
          canvasRef.current.width = width;
          canvasRef.current.height = height;
        }

        // OpenCVフィルター処理 - Canvas2Dを使用してビデオフレームを取得
        const canvas2d = document.createElement('canvas');
        canvas2d.width = width;
        canvas2d.height = height;
        const ctx = canvas2d.getContext('2d');
        if (!ctx) {
          requestId = requestAnimationFrame(draw);
          return;
        }
        
        // ビデオフレームをcanvasに描画
        ctx.drawImage(videoRef.current, 0, 0, width, height);
        
        // canvasからImageDataを取得してMatに変換
        const imageData = ctx.getImageData(0, 0, width, height);
        const src = cv.matFromImageData(imageData);
        
        // 読み取ったMatが空でないことを確認
        if (src.empty()) {
          console.log('ビデオフレームが空です');
          src.delete();
          requestId = requestAnimationFrame(draw);
          return;
        }
        
        // アニメ風フィルター処理を適用
        const result = cartoonizeImage(src);
        cv.imshow(canvasRef.current, result);

        // メモリ解放
        src.delete();
        result.delete();
      } catch (error) {
        console.error('フィルター処理エラー:', error);
      }

      requestId = requestAnimationFrame(draw);
    };

    // アニメ風フィルター処理関数
    function cartoonizeImage(img: any) {
      try {
        console.log('cartoonizeImage開始 - 入力画像サイズ:', img.rows, 'x', img.cols, '型:', img.type());
        
        // 入力画像の型をCV_8UC4に変換
        const imgRGB = new cv.Mat();
        if (img.type() !== cv.CV_8UC3) {
          console.log('色空間変換を実行');
          cv.cvtColor(img, imgRGB, cv.COLOR_RGBA2RGB);
        } else {
          console.log('既にRGB形式');
          img.copyTo(imgRGB);
        }
        
        console.log('ステップ1: バイラテラルフィルター開始');
        // ステップ1: バイラテラルフィルターで画像の平滑化
        const imgColor = new cv.Mat();
        cv.bilateralFilter(imgRGB, imgColor, 7, 75, 75);
        console.log('ステップ1完了');
        
        console.log('ステップ2: グレースケール変換開始');
        // ステップ2: グレースケール化とメディアンブラー
        const imgGray = new cv.Mat();
        cv.cvtColor(imgRGB, imgGray, cv.COLOR_RGBA2GRAY);
        console.log('ステップ2-1完了');
        
        const imgBlur = new cv.Mat();
        cv.medianBlur(imgGray, imgBlur, 5);
        console.log('ステップ2完了');
        
        console.log('ステップ3: エッジ検出開始');
        // ステップ3: エッジ検出（適応的閾値処理）
        const imgEdge = new cv.Mat();
        cv.adaptiveThreshold(
          imgBlur,
          imgEdge,
          255,
          cv.ADAPTIVE_THRESH_MEAN_C,
          cv.THRESH_BINARY,
          9,  // blockSize
          2   // C値
        );
        console.log('ステップ3完了');
        
        console.log('ステップ4: エッジ画像色変換開始');
        // ステップ4: エッジ画像をRGBAに変換
        const imgEdgeColor = new cv.Mat();
        cv.cvtColor(imgEdge, imgEdgeColor, cv.COLOR_GRAY2RGB);
        console.log('ステップ4完了');
        
        console.log('ステップ5: 画像合成開始');
        // ステップ5: カラー画像とエッジ画像を合成
        const cartoon = new cv.Mat();
        cv.bitwise_and(imgColor, imgEdgeColor, cartoon);
        console.log('ステップ5完了');
        
        // 中間画像のメモリ解放
        imgRGB.delete();
        imgColor.delete();
        imgGray.delete();
        imgBlur.delete();
        imgEdge.delete();
        imgEdgeColor.delete();
        
        console.log('cartoonizeImage完了');
        return cartoon;
      } catch (error: any) {
        console.error('cartoonizeImageエラー:', error);
        console.error('エラー詳細:', error.toString());
        // エラーの場合は元の画像を返す
        const result = new cv.Mat();
        img.copyTo(result);
        return result;
      }
    }

    console.log('アニメーションフレーム開始');
    requestId = requestAnimationFrame(draw);
    
    return () => {
      console.log('フィルター処理クリーンアップ');
      cancelAnimationFrame(requestId);
    };
  }, [cvReady, selectedDeviceId, stream]);

  // ウィンドウリサイズ時の表示サイズ調整
  useEffect(() => {
    const handleResize = () => {
      if (videoRef.current) {
        const width = videoRef.current.videoWidth;
        if (width) {
          const maxWidth = Math.min(width, window.innerWidth * 0.9);
          const scale = maxWidth / width;
          setDisplaySize({
            width: Math.floor(width * scale),
            height: Math.floor(videoRef.current.videoHeight * scale)
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
      <h1>アニメ風フィルター（カメラ選択対応）</h1>

      <label>
        カメラ選択：
        <select
          value={selectedDeviceId ?? ''}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
        >
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `カメラ (${device.deviceId.slice(0, 4)})`}
            </option>
          ))}
        </select>
      </label>
      
      <div style={{ marginTop: '10px' }}>
        <p>OpenCV準備状態: {cvReady ? '✅ 準備完了' : '❌ 準備中...'}</p>
        <p>カメラ解像度: {videoSize.width}x{videoSize.height}</p>
        <p>表示サイズ: {displaySize.width}x{displaySize.height}</p>
        
        <button onClick={() => {
          const cvStatus = {
            cvReady,
            stream: !!stream,
            openCvExists: typeof (window as any).cv !== 'undefined'
          };
          console.log('OpenCV状態確認:', cvStatus);
          
          // OpenCVが読み込まれているのにcvReadyがfalseの場合は強制更新
          if (!cvReady && typeof (window as any).cv !== 'undefined') {
            console.log('OpenCVを強制的に準備完了に設定');
            setCvReady(true);
          }
        }}>
          OpenCV状態確認
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
        <video 
          ref={videoRef} 
          style={{ 
            width: `${displaySize.width}px`, 
            height: `${displaySize.height}px`,
            objectFit: 'contain'
          }}
          autoPlay 
          playsInline 
          muted 
        />
        <canvas 
          ref={canvasRef}
          style={{ 
            width: `${displaySize.width}px`, 
            height: `${displaySize.height}px`,
            objectFit: 'contain'
          }}
        />
      </div>
    </div>
  );
}
